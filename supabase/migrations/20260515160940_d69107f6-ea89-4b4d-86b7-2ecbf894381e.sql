
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS balance_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS risk_flag boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  CREATE TYPE public.hold_status AS ENUM ('active','cleared','admin_override');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.hold_source AS ENUM ('refund','chargeback','failed_label','fee','manual','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.account_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status public.hold_status NOT NULL DEFAULT 'active',
  balance_owed_cents bigint NOT NULL DEFAULT 0,
  reason text,
  source public.hold_source NOT NULL DEFAULT 'other',
  opened_at timestamptz NOT NULL DEFAULT now(),
  cleared_at timestamptz,
  opened_by uuid,
  cleared_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS account_holds_one_active_per_user
  ON public.account_holds (user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS account_holds_user_idx ON public.account_holds(user_id);
CREATE INDEX IF NOT EXISTS account_holds_status_idx ON public.account_holds(status);

ALTER TABLE public.account_holds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own holds"
  ON public.account_holds FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Staff view all holds"
  ON public.account_holds FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'owner') OR
    public.has_role(auth.uid(), 'moderator') OR
    public.has_role(auth.uid(), 'support')
  );

CREATE POLICY "Staff update holds"
  ON public.account_holds FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'owner') OR
    public.has_role(auth.uid(), 'moderator') OR
    public.has_role(auth.uid(), 'support')
  );

CREATE POLICY "Staff insert holds"
  ON public.account_holds FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'owner') OR
    public.has_role(auth.uid(), 'moderator') OR
    public.has_role(auth.uid(), 'support')
  );

CREATE OR REPLACE FUNCTION public.account_holds_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS account_holds_set_updated_at ON public.account_holds;
CREATE TRIGGER account_holds_set_updated_at
  BEFORE UPDATE ON public.account_holds
  FOR EACH ROW EXECUTE FUNCTION public.account_holds_touch_updated_at();

CREATE OR REPLACE FUNCTION public.has_active_hold(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.account_holds WHERE user_id = _user_id AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.auto_open_balance_hold()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.balance_cents < -2000 AND (OLD.balance_cents IS NULL OR OLD.balance_cents >= -2000) THEN
    INSERT INTO public.account_holds (user_id, status, balance_owed_cents, reason, source)
    VALUES (NEW.id, 'active', -NEW.balance_cents, 'Account balance below -$20', 'fee')
    ON CONFLICT DO NOTHING;
  END IF;
  IF NEW.balance_cents < -2000 THEN NEW.payout_hold := true; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_auto_open_hold ON public.profiles;
CREATE TRIGGER profiles_auto_open_hold
  BEFORE UPDATE OF balance_cents ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.auto_open_balance_hold();

CREATE OR REPLACE FUNCTION public.clear_hold_admin(_hold_id uuid, _override boolean DEFAULT false, _notes text DEFAULT NULL)
RETURNS public.account_holds
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hold public.account_holds;
  v_caller uuid := auth.uid();
BEGIN
  IF NOT (
    public.has_role(v_caller, 'admin') OR
    public.has_role(v_caller, 'owner') OR
    public.has_role(v_caller, 'moderator') OR
    public.has_role(v_caller, 'support')
  ) THEN RAISE EXCEPTION 'Only staff can clear holds'; END IF;

  UPDATE public.account_holds
  SET status = CASE WHEN _override THEN 'admin_override'::public.hold_status ELSE 'cleared'::public.hold_status END,
      cleared_at = now(),
      cleared_by = v_caller,
      notes = COALESCE(notes || E'\n', '') || COALESCE(_notes, '')
  WHERE id = _hold_id
  RETURNING * INTO v_hold;

  IF NOT EXISTS (SELECT 1 FROM public.account_holds WHERE user_id = v_hold.user_id AND status = 'active') THEN
    UPDATE public.profiles SET payout_hold = false WHERE id = v_hold.user_id;
  END IF;

  RETURN v_hold;
END;
$$;

GRANT EXECUTE ON FUNCTION public.has_active_hold(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_hold_admin(uuid, boolean, text) TO authenticated;

CREATE OR REPLACE VIEW public.v_user_hold_status AS
SELECT
  p.id AS user_id,
  p.balance_cents,
  p.risk_flag,
  h.id AS hold_id,
  h.balance_owed_cents,
  h.reason,
  h.source,
  h.opened_at
FROM public.profiles p
LEFT JOIN public.account_holds h
  ON h.user_id = p.id AND h.status = 'active';
