-- ============== REWARD DEFINITIONS (admin-configurable catalog) ==============
CREATE TABLE public.reward_definitions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  type text NOT NULL DEFAULT 'set_completion', -- set_completion|milestone|achievement|community|event
  trigger_key text,            -- e.g. milestone count, achievement slug, event id
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  icon text NOT NULL DEFAULT 'trophy',
  credits integer NOT NULL DEFAULT 0,
  xp integer NOT NULL DEFAULT 0,
  badge_slug text,
  title_slug text,
  frame_slug text,
  threshold integer,           -- milestone: number of sets to complete
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.reward_definitions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reward_definitions TO authenticated;
GRANT ALL ON public.reward_definitions TO service_role;

ALTER TABLE public.reward_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reward defs public read active"
  ON public.reward_definitions FOR SELECT
  USING (is_active OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "reward defs admin insert"
  ON public.reward_definitions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "reward defs admin update"
  ON public.reward_definitions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "reward defs admin delete"
  ON public.reward_definitions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER reward_definitions_set_updated_at
  BEFORE UPDATE ON public.reward_definitions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============== REWARD CLAIMS (per-user workflow ledger) ==============
CREATE TABLE public.reward_claims (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reward_def_id uuid NOT NULL REFERENCES public.reward_definitions(id) ON DELETE CASCADE,
  context_key text NOT NULL DEFAULT '',   -- e.g. set key "pokemon|||team rocket"
  context_label text,                     -- human label e.g. "Team Rocket"
  status text NOT NULL DEFAULT 'in_progress', -- in_progress|unlocked|ready_to_claim|claimed|expired
  progress integer NOT NULL DEFAULT 0,
  target integer NOT NULL DEFAULT 0,
  unlocked_at timestamptz,
  claimed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, reward_def_id, context_key)
);

GRANT SELECT, INSERT, UPDATE ON public.reward_claims TO authenticated;
GRANT ALL ON public.reward_claims TO service_role;

ALTER TABLE public.reward_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reward claims self read"
  ON public.reward_claims FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_reward_claims_user ON public.reward_claims (user_id, status);

CREATE TRIGGER reward_claims_set_updated_at
  BEFORE UPDATE ON public.reward_claims
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============== CREDIT WALLET ==============
CREATE TABLE public.credit_wallets (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance bigint NOT NULL DEFAULT 0,
  lifetime_earned bigint NOT NULL DEFAULT 0,
  lifetime_spent bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.credit_wallets TO authenticated;
GRANT ALL ON public.credit_wallets TO service_role;

ALTER TABLE public.credit_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credit wallet self read"
  ON public.credit_wallets FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ============== CREDIT TRANSACTIONS (immutable ledger) ==============
CREATE TABLE public.credit_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount bigint NOT NULL,        -- positive earn, negative spend
  balance_after bigint NOT NULL,
  source text NOT NULL DEFAULT 'reward_claim',
  ref_id text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.credit_transactions TO authenticated;
GRANT ALL ON public.credit_transactions TO service_role;

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credit tx self read"
  ON public.credit_transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_credit_tx_user ON public.credit_transactions (user_id, created_at DESC);

-- ============== award_credits: grant credits to current user ==============
CREATE OR REPLACE FUNCTION public.award_credits(
  _amount bigint,
  _source text DEFAULT 'reward_claim',
  _ref_id text DEFAULT NULL,
  _description text DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _new_balance bigint;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _amount = 0 THEN
    SELECT balance INTO _new_balance FROM public.credit_wallets WHERE user_id = _uid;
    RETURN COALESCE(_new_balance, 0);
  END IF;

  INSERT INTO public.credit_wallets (user_id, balance, lifetime_earned, lifetime_spent)
  VALUES (
    _uid,
    GREATEST(0, _amount),
    GREATEST(0, _amount),
    GREATEST(0, -_amount)
  )
  ON CONFLICT (user_id) DO UPDATE SET
    balance = public.credit_wallets.balance + _amount,
    lifetime_earned = public.credit_wallets.lifetime_earned + GREATEST(0, _amount),
    lifetime_spent = public.credit_wallets.lifetime_spent + GREATEST(0, -_amount),
    updated_at = now()
  RETURNING balance INTO _new_balance;

  INSERT INTO public.credit_transactions (user_id, amount, balance_after, source, ref_id, description)
  VALUES (_uid, _amount, _new_balance, _source, _ref_id, _description);

  RETURN _new_balance;
END;
$$;

-- ============== claim_reward: one-time claim, grants credits+XP+badge ==============
CREATE OR REPLACE FUNCTION public.claim_reward(
  _def_slug text,
  _context_key text DEFAULT '',
  _context_label text DEFAULT NULL
) RETURNS TABLE (
  granted boolean,
  credits integer,
  xp integer,
  badge_slug text,
  title text,
  description text,
  new_balance bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _def public.reward_definitions%ROWTYPE;
  _existing public.reward_claims%ROWTYPE;
  _bal bigint;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO _def FROM public.reward_definitions
    WHERE slug = _def_slug AND is_active = true;
  IF _def.id IS NULL THEN RAISE EXCEPTION 'Reward not found or inactive'; END IF;

  SELECT * INTO _existing FROM public.reward_claims
    WHERE user_id = _uid AND reward_def_id = _def.id
      AND context_key = COALESCE(_context_key, '');

  IF _existing.id IS NOT NULL AND _existing.status = 'claimed' THEN
    -- already claimed; no double grant
    SELECT balance INTO _bal FROM public.credit_wallets WHERE user_id = _uid;
    RETURN QUERY SELECT false, _def.credits, _def.xp, _def.badge_slug, _def.title, _def.description, COALESCE(_bal, 0);
    RETURN;
  END IF;

  -- upsert claim as claimed
  INSERT INTO public.reward_claims (
    user_id, reward_def_id, context_key, context_label,
    status, progress, target, unlocked_at, claimed_at
  ) VALUES (
    _uid, _def.id, COALESCE(_context_key, ''), _context_label,
    'claimed', 1, 1, now(), now()
  )
  ON CONFLICT (user_id, reward_def_id, context_key)
  DO UPDATE SET status = 'claimed', claimed_at = now(),
    unlocked_at = COALESCE(public.reward_claims.unlocked_at, now()),
    context_label = COALESCE(EXCLUDED.context_label, public.reward_claims.context_label),
    updated_at = now();

  -- grant credits
  IF _def.credits <> 0 THEN
    _bal := public.award_credits(_def.credits::bigint, 'reward_claim', _def.slug, _def.title);
  ELSE
    SELECT balance INTO _bal FROM public.credit_wallets WHERE user_id = _uid;
  END IF;

  -- grant XP
  IF _def.xp > 0 THEN
    PERFORM public.award_xp(_def.xp, 'reward', _def.slug);
  END IF;

  -- grant badge / cosmetic
  IF _def.badge_slug IS NOT NULL THEN
    INSERT INTO public.user_rewards (user_id, reward_slug)
    VALUES (_uid, _def.badge_slug)
    ON CONFLICT (user_id, reward_slug) DO NOTHING;
  END IF;

  RETURN QUERY SELECT true, _def.credits, _def.xp, _def.badge_slug, _def.title, _def.description, COALESCE(_bal, 0);
END;
$$;

-- ============== record_reward_progress: upsert in-progress / ready state ==============
CREATE OR REPLACE FUNCTION public.record_reward_progress(
  _def_slug text,
  _progress integer,
  _target integer,
  _context_key text DEFAULT '',
  _context_label text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _def_id uuid;
  _ready boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT id INTO _def_id FROM public.reward_definitions WHERE slug = _def_slug AND is_active = true;
  IF _def_id IS NULL THEN RETURN; END IF;
  _ready := _target > 0 AND _progress >= _target;

  INSERT INTO public.reward_claims (
    user_id, reward_def_id, context_key, context_label, status, progress, target, unlocked_at
  ) VALUES (
    _uid, _def_id, COALESCE(_context_key, ''), _context_label,
    CASE WHEN _ready THEN 'ready_to_claim' ELSE 'in_progress' END,
    _progress, _target,
    CASE WHEN _ready THEN now() ELSE NULL END
  )
  ON CONFLICT (user_id, reward_def_id, context_key) DO UPDATE SET
    progress = EXCLUDED.progress,
    target = EXCLUDED.target,
    context_label = COALESCE(EXCLUDED.context_label, public.reward_claims.context_label),
    status = CASE
      WHEN public.reward_claims.status = 'claimed' THEN 'claimed'
      WHEN _ready THEN 'ready_to_claim'
      ELSE 'in_progress' END,
    unlocked_at = CASE
      WHEN public.reward_claims.status = 'claimed' THEN public.reward_claims.unlocked_at
      WHEN _ready THEN COALESCE(public.reward_claims.unlocked_at, now())
      ELSE public.reward_claims.unlocked_at END,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.award_credits(bigint, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_reward(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_reward_progress(text, integer, integer, text, text) TO authenticated, service_role;