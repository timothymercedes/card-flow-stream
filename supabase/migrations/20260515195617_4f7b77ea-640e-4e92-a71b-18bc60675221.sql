
DO $$ BEGIN
  CREATE TYPE public.payout_status AS ENUM ('requested','processing','completed','failed','canceled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.payout_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  status public.payout_status NOT NULL DEFAULT 'requested',
  stripe_transfer_id TEXT,
  failure_reason TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payout_requests_user_status
  ON public.payout_requests(user_id, status);
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users view own payouts" ON public.payout_requests;
CREATE POLICY "users view own payouts" ON public.payout_requests
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.shipping_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  order_id UUID,
  adjustment_type TEXT NOT NULL,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  was_charged BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shipping_adjustments_user
  ON public.shipping_adjustments(user_id, created_at DESC);
ALTER TABLE public.shipping_adjustments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users view own shipping adj" ON public.shipping_adjustments;
CREATE POLICY "users view own shipping adj" ON public.shipping_adjustments
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.set_updated_at_now()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_payout_requests_updated ON public.payout_requests;
CREATE TRIGGER trg_payout_requests_updated BEFORE UPDATE ON public.payout_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();

CREATE OR REPLACE FUNCTION public.request_payout(_amount_cents INTEGER)
RETURNS public.payout_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid UUID := auth.uid(); _existing UUID; _row public.payout_requests;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _amount_cents IS NULL OR _amount_cents <= 0 THEN RAISE EXCEPTION 'Invalid payout amount'; END IF;
  SELECT id INTO _existing FROM public.payout_requests
   WHERE user_id = _uid AND status IN ('requested','processing') LIMIT 1;
  IF _existing IS NOT NULL THEN RAISE EXCEPTION 'A payout is already in progress'; END IF;
  INSERT INTO public.payout_requests(user_id, amount_cents, status)
  VALUES (_uid, _amount_cents, 'processing') RETURNING * INTO _row;
  RETURN _row;
END $$;

CREATE OR REPLACE FUNCTION public.complete_payout(_id UUID, _transfer_id TEXT)
RETURNS public.payout_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.payout_requests; BEGIN
  UPDATE public.payout_requests SET status='completed', stripe_transfer_id=_transfer_id,
    completed_at=now(), updated_at=now() WHERE id=_id RETURNING * INTO _row;
  RETURN _row;
END $$;

CREATE OR REPLACE FUNCTION public.fail_payout(_id UUID, _reason TEXT)
RETURNS public.payout_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.payout_requests; BEGIN
  UPDATE public.payout_requests SET status='failed', failure_reason=_reason, updated_at=now()
   WHERE id=_id RETURNING * INTO _row;
  RETURN _row;
END $$;

CREATE OR REPLACE FUNCTION public.record_shipping_adjustment(
  _order_id UUID, _type TEXT, _cost_cents INTEGER, _notes TEXT DEFAULT NULL
) RETURNS public.shipping_adjustments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid UUID := auth.uid(); _count INTEGER; _charge BOOLEAN := FALSE; _row public.shipping_adjustments;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT COUNT(*) INTO _count FROM public.shipping_adjustments WHERE user_id = _uid;
  IF _count >= 3 AND _cost_cents > 0 THEN
    _charge := TRUE;
    UPDATE public.profiles SET balance_cents = COALESCE(balance_cents,0) - _cost_cents WHERE id = _uid;
  END IF;
  INSERT INTO public.shipping_adjustments(user_id, order_id, adjustment_type, cost_cents, was_charged, notes)
  VALUES (_uid, _order_id, _type, _cost_cents, _charge, _notes) RETURNING * INTO _row;
  RETURN _row;
END $$;
