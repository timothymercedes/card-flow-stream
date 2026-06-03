-- ============== COLLECTION WHEEL SLOTS (admin-configurable reward pool) ==============
CREATE TABLE public.collection_wheel_slots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  label text NOT NULL,
  rarity text NOT NULL DEFAULT 'common', -- common|rare|epic|legendary
  reward_kind text NOT NULL DEFAULT 'credits', -- credits|xp|badge|frame|title|trophy|featured|community
  reward_slug text,            -- cosmetic slug stored in user_rewards
  credits integer NOT NULL DEFAULT 0,
  xp integer NOT NULL DEFAULT 0,
  icon text NOT NULL DEFAULT 'gift',
  color text NOT NULL DEFAULT '#7c7c8a',
  weight integer NOT NULL DEFAULT 100,  -- relative drop weight (admin tunable)
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.collection_wheel_slots TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.collection_wheel_slots TO authenticated;
GRANT ALL ON public.collection_wheel_slots TO service_role;

ALTER TABLE public.collection_wheel_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cwheel slots public read active"
  ON public.collection_wheel_slots FOR SELECT
  USING (is_active OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "cwheel slots admin insert"
  ON public.collection_wheel_slots FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "cwheel slots admin update"
  ON public.collection_wheel_slots FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "cwheel slots admin delete"
  ON public.collection_wheel_slots FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER collection_wheel_slots_set_updated_at
  BEFORE UPDATE ON public.collection_wheel_slots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============== COLLECTION WHEEL SPINS (history + one-per-set guard) ==============
CREATE TABLE public.collection_wheel_spins (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  context_key text NOT NULL,         -- set key "pokemon|||team rocket"
  context_label text,                -- "Team Rocket"
  slot_id uuid REFERENCES public.collection_wheel_slots(id) ON DELETE SET NULL,
  label text NOT NULL DEFAULT '',
  rarity text NOT NULL DEFAULT 'common',
  reward_kind text NOT NULL DEFAULT 'credits',
  reward_slug text,
  credits integer NOT NULL DEFAULT 0,
  xp integer NOT NULL DEFAULT 0,
  icon text NOT NULL DEFAULT 'gift',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, context_key)
);

GRANT SELECT ON public.collection_wheel_spins TO anon, authenticated;
GRANT ALL ON public.collection_wheel_spins TO service_role;

ALTER TABLE public.collection_wheel_spins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cwheel spins self read"
  ON public.collection_wheel_spins FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "cwheel spins public read"
  ON public.collection_wheel_spins FOR SELECT
  USING (true);  -- so profiles can showcase rewards won

CREATE INDEX idx_collection_wheel_spins_user ON public.collection_wheel_spins (user_id, created_at DESC);

-- ============== spin_collection_wheel: server-authoritative spin ==============
CREATE OR REPLACE FUNCTION public.spin_collection_wheel(
  _context_key text,
  _context_label text DEFAULT NULL
) RETURNS TABLE (
  slot_id uuid,
  label text,
  rarity text,
  reward_kind text,
  reward_slug text,
  credits integer,
  xp integer,
  icon text,
  color text,
  already_spun boolean,
  new_balance bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  total_w bigint;
  pick bigint;
  chosen public.collection_wheel_slots%ROWTYPE;
  existing public.collection_wheel_spins%ROWTYPE;
  ready_claim public.reward_claims%ROWTYPE;
  bal bigint;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _context_key IS NULL OR length(_context_key) = 0 THEN RAISE EXCEPTION 'Missing set'; END IF;

  -- one spin per completed set
  SELECT * INTO existing FROM public.collection_wheel_spins
    WHERE user_id = uid AND context_key = _context_key;
  IF existing.id IS NOT NULL THEN
    SELECT balance INTO bal FROM public.credit_wallets WHERE user_id = uid;
    RETURN QUERY SELECT existing.slot_id, existing.label, existing.rarity, existing.reward_kind,
      existing.reward_slug, existing.credits, existing.xp, existing.icon, '#7c7c8a'::text,
      true, COALESCE(bal, 0);
    RETURN;
  END IF;

  -- defense in depth: the set must be marked complete (ready/claimed) before spinning
  SELECT rc.* INTO ready_claim
    FROM public.reward_claims rc
    JOIN public.reward_definitions rd ON rd.id = rc.reward_def_id
   WHERE rc.user_id = uid
     AND rd.slug = 'set_completion'
     AND rc.context_key = _context_key
     AND rc.status IN ('ready_to_claim', 'claimed');
  IF ready_claim.id IS NULL THEN
    RAISE EXCEPTION 'This set is not complete yet';
  END IF;

  -- weighted-random pick from active slots
  SELECT COALESCE(SUM(weight), 0) INTO total_w FROM public.collection_wheel_slots WHERE is_active AND weight > 0;
  IF total_w = 0 THEN RAISE EXCEPTION 'No wheel rewards configured'; END IF;

  pick := floor(random() * total_w)::bigint;
  FOR chosen IN
    SELECT * FROM public.collection_wheel_slots WHERE is_active AND weight > 0 ORDER BY created_at
  LOOP
    IF pick < chosen.weight THEN EXIT; END IF;
    pick := pick - chosen.weight;
  END LOOP;

  -- grant credits
  IF chosen.credits <> 0 THEN
    bal := public.award_credits(chosen.credits::bigint, 'wheel_spin', _context_key, chosen.label);
  ELSE
    SELECT balance INTO bal FROM public.credit_wallets WHERE user_id = uid;
  END IF;

  -- grant XP
  IF chosen.xp > 0 THEN
    PERFORM public.award_xp(chosen.xp, 'wheel_spin', _context_key);
  END IF;

  -- grant cosmetic
  IF chosen.reward_slug IS NOT NULL AND chosen.reward_kind <> 'credits' AND chosen.reward_kind <> 'xp' THEN
    INSERT INTO public.user_rewards (user_id, reward_slug, quantity)
    VALUES (uid, chosen.reward_slug, 1)
    ON CONFLICT (user_id, reward_slug) DO UPDATE
      SET quantity = public.user_rewards.quantity + 1;
  END IF;

  -- log the spin (also enforces one-per-set via UNIQUE)
  INSERT INTO public.collection_wheel_spins (
    user_id, context_key, context_label, slot_id, label, rarity,
    reward_kind, reward_slug, credits, xp, icon
  ) VALUES (
    uid, _context_key, _context_label, chosen.id, chosen.label, chosen.rarity,
    chosen.reward_kind, chosen.reward_slug, chosen.credits, chosen.xp, chosen.icon
  );

  RETURN QUERY SELECT chosen.id, chosen.label, chosen.rarity, chosen.reward_kind,
    chosen.reward_slug, chosen.credits, chosen.xp, chosen.icon, chosen.color,
    false, COALESCE(bal, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.spin_collection_wheel(text, text) TO authenticated;

-- ============== Seed a balanced starter reward pool ==============
INSERT INTO public.collection_wheel_slots (label, rarity, reward_kind, reward_slug, credits, xp, icon, color, weight, sort_order) VALUES
  ('100 Credits',        'common', 'credits', NULL,                    100, 0,   'coins',  '#9ca3af', 220, 1),
  ('50 XP',              'common', 'xp',      NULL,                    0,   50,  'star',   '#a3a3a3', 200, 2),
  ('Collector Badge',    'common', 'badge',   'badge_set_collector',   25,  25,  'badge',  '#94a3b8', 180, 3),
  ('250 Credits',        'rare',   'credits', NULL,                    250, 0,   'coins',  '#3b82f6', 120, 4),
  ('Exclusive Frame',    'rare',   'frame',   'frame_rare_collector',  100, 50,  'frame',  '#2563eb', 90,  5),
  ('Set Master Title',   'rare',   'title',   'title_set_master',      100, 75,  'crown',  '#1d4ed8', 80,  6),
  ('500 Credits',        'epic',   'credits', NULL,                    500, 0,   'coins',  '#a855f7', 45,  7),
  ('Completion Trophy',  'epic',   'trophy',  'trophy_set_complete',   250, 150, 'trophy', '#9333ea', 35,  8),
  ('Community Spotlight','epic',   'community','community_spotlight',   200, 100, 'megaphone','#7e22ce', 25, 9),
  ('Featured Listing',   'epic',   'featured','featured_listing_credit',300, 50, 'sparkles','#8b5cf6', 25, 10),
  ('1500 Credits',       'legendary','credits', NULL,                  1500,0,   'coins',  '#f59e0b', 8,   11),
  ('Founder Collectible','legendary','trophy', 'trophy_founder',       500, 300, 'gem',    '#d97706', 5,   12),
  ('Ultra-Rare Title',   'legendary','title',  'title_legend_collector',500, 250,'crown',  '#b45309', 5,   13),
  ('Limited Frame',      'legendary','frame',  'frame_legendary',      500, 200, 'frame',  '#f59e0b', 6,   14);