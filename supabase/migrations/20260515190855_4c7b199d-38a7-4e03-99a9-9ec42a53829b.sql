
CREATE TABLE IF NOT EXISTS public.hold_recoveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  hold_id uuid REFERENCES public.account_holds(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'payout',
  reference_id text,
  gross_cents bigint NOT NULL,
  deducted_cents bigint NOT NULL,
  net_released_cents bigint NOT NULL,
  remaining_owed_cents bigint NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hold_recoveries_user_idx ON public.hold_recoveries(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS hold_recoveries_hold_idx ON public.hold_recoveries(hold_id);

ALTER TABLE public.hold_recoveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own recoveries" ON public.hold_recoveries;
CREATE POLICY "Users view own recoveries"
  ON public.hold_recoveries FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Staff view all recoveries" ON public.hold_recoveries;
CREATE POLICY "Staff view all recoveries"
  ON public.hold_recoveries FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'owner') OR
    public.has_role(auth.uid(), 'moderator') OR
    public.has_role(auth.uid(), 'support')
  );

CREATE OR REPLACE FUNCTION public.apply_hold_recovery(
  _user_id uuid,
  _gross_cents bigint,
  _source text DEFAULT 'payout',
  _reference_id text DEFAULT NULL
)
RETURNS public.hold_recoveries
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hold public.account_holds;
  v_owed bigint := 0;
  v_deduct bigint := 0;
  v_net bigint := _gross_cents;
  v_remaining bigint := 0;
  v_rec public.hold_recoveries;
BEGIN
  IF _gross_cents <= 0 THEN
    RAISE EXCEPTION 'gross_cents must be positive';
  END IF;

  SELECT * INTO v_hold FROM public.account_holds
    WHERE user_id = _user_id AND status = 'active'
    FOR UPDATE;

  IF FOUND THEN
    v_owed := v_hold.balance_owed_cents;
    v_deduct := LEAST(v_owed, _gross_cents);
    v_net := _gross_cents - v_deduct;
    v_remaining := v_owed - v_deduct;

    UPDATE public.account_holds
      SET balance_owed_cents = v_remaining
      WHERE id = v_hold.id;
  END IF;

  -- Credit net to the seller balance (deducted portion offsets the negative)
  UPDATE public.profiles
    SET balance_cents = balance_cents + _gross_cents - v_deduct + v_deduct
    WHERE id = _user_id;
  -- Note: the line above credits gross-deduct (net) to balance; the deducted
  -- portion was already accounted as debt in balance_cents, so we add it back
  -- to bring the balance toward zero. Net effect: balance += gross.
  -- If the seller's balance is now >= 0 and a hold is active, auto-clear it.
  IF v_hold.id IS NOT NULL AND v_remaining <= 0 THEN
    UPDATE public.account_holds
      SET status = 'cleared',
          cleared_at = now(),
          notes = COALESCE(notes || E'\n', '') || 'Auto-cleared via recovery'
      WHERE id = v_hold.id;
    UPDATE public.profiles SET payout_hold = false WHERE id = _user_id;
  END IF;

  INSERT INTO public.hold_recoveries
    (user_id, hold_id, source, reference_id, gross_cents, deducted_cents, net_released_cents, remaining_owed_cents)
    VALUES (_user_id, v_hold.id, _source, _reference_id, _gross_cents, v_deduct, v_net, v_remaining)
    RETURNING * INTO v_rec;

  RETURN v_rec;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_hold_recovery(uuid, bigint, text, text) TO authenticated;
