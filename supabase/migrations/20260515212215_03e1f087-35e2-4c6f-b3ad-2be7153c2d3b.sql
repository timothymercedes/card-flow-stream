
-- Platform revenue ledger: immutable audit log of all platform earnings/losses
CREATE TYPE public.platform_revenue_kind AS ENUM (
  'marketplace_commission',
  'intl_processing_fee',
  'tip_fee',
  'promotion',
  'shipping_adjustment_fee',
  'refund_loss',
  'dispute_loss',
  'stripe_processing_fee',
  'adjustment'
);

CREATE TABLE public.platform_revenue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind public.platform_revenue_kind NOT NULL,
  amount_cents BIGINT NOT NULL, -- positive = revenue in, negative = loss/refund out
  currency TEXT NOT NULL DEFAULT 'usd',
  seller_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  buyer_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  order_id  UUID,
  stripe_payment_intent_id TEXT,
  stripe_charge_id TEXT,
  stripe_event_id TEXT UNIQUE, -- idempotency anchor for webhooks
  notes TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_platform_revenue_created_at ON public.platform_revenue (created_at DESC);
CREATE INDEX idx_platform_revenue_kind ON public.platform_revenue (kind);
CREATE INDEX idx_platform_revenue_pi ON public.platform_revenue (stripe_payment_intent_id);

ALTER TABLE public.platform_revenue ENABLE ROW LEVEL SECURITY;

-- Only admins/owners may read; nobody (besides service role) writes via API
CREATE POLICY "Admin/owner read platform revenue"
  ON public.platform_revenue FOR SELECT
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

-- Block updates/deletes (immutable ledger)
CREATE POLICY "No updates" ON public.platform_revenue FOR UPDATE USING (false);
CREATE POLICY "No deletes" ON public.platform_revenue FOR DELETE USING (false);

-- Idempotent insert helper for webhooks/server code
CREATE OR REPLACE FUNCTION public.log_platform_revenue(
  _kind public.platform_revenue_kind,
  _amount_cents BIGINT,
  _seller_id UUID DEFAULT NULL,
  _buyer_id UUID DEFAULT NULL,
  _order_id UUID DEFAULT NULL,
  _stripe_pi TEXT DEFAULT NULL,
  _stripe_charge TEXT DEFAULT NULL,
  _stripe_event TEXT DEFAULT NULL,
  _notes TEXT DEFAULT NULL,
  _meta JSONB DEFAULT '{}'::jsonb
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id UUID;
BEGIN
  IF _stripe_event IS NOT NULL THEN
    SELECT id INTO _id FROM public.platform_revenue WHERE stripe_event_id = _stripe_event;
    IF _id IS NOT NULL THEN RETURN _id; END IF;
  END IF;
  INSERT INTO public.platform_revenue
    (kind, amount_cents, seller_id, buyer_id, order_id, stripe_payment_intent_id,
     stripe_charge_id, stripe_event_id, notes, meta)
  VALUES
    (_kind, _amount_cents, _seller_id, _buyer_id, _order_id, _stripe_pi,
     _stripe_charge, _stripe_event, _notes, COALESCE(_meta, '{}'::jsonb))
  RETURNING id INTO _id;
  RETURN _id;
END $$;

-- Admin summary (kind totals + grand totals) for the revenue dashboard
CREATE OR REPLACE FUNCTION public.admin_revenue_summary(_since TIMESTAMPTZ DEFAULT NULL)
RETURNS TABLE (
  kind public.platform_revenue_kind,
  total_cents BIGINT,
  count BIGINT
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT pr.kind, COALESCE(SUM(pr.amount_cents),0)::BIGINT, COUNT(*)::BIGINT
    FROM public.platform_revenue pr
    WHERE _since IS NULL OR pr.created_at >= _since
    GROUP BY pr.kind
    ORDER BY pr.kind;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_revenue_summary(TIMESTAMPTZ) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_platform_revenue(
  _limit INT DEFAULT 100, _offset INT DEFAULT 0, _kind public.platform_revenue_kind DEFAULT NULL
) RETURNS SETOF public.platform_revenue
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT * FROM public.platform_revenue
    WHERE _kind IS NULL OR kind = _kind
    ORDER BY created_at DESC
    LIMIT GREATEST(1, LEAST(_limit, 500))
    OFFSET GREATEST(0, _offset);
END $$;
GRANT EXECUTE ON FUNCTION public.admin_list_platform_revenue(INT, INT, public.platform_revenue_kind) TO authenticated;

-- Exempt owner/admin accounts from trust-tier payout restrictions.
-- They get instant 100% release unless manual_override_pct or frozen is set.
CREATE OR REPLACE FUNCTION public.compute_seller_payable(_user_id UUID)
RETURNS TABLE (
  available_cents BIGINT,
  pending_cents BIGINT,
  locked_cents BIGINT,
  in_flight_cents BIGINT,
  owed_cents BIGINT,
  payable_cents BIGINT,
  instant_pct INTEGER,
  tier public.seller_trust_tier,
  frozen BOOLEAN
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _trust public.seller_trust;
  _instant INTEGER;
  _delivered_net BIGINT := 0;
  _undelivered_net BIGINT := 0;
  _instant_from_pending BIGINT := 0;
  _locked BIGINT := 0;
  _inflight BIGINT := 0;
  _owed BIGINT := 0;
  _is_admin BOOLEAN := false;
BEGIN
  PERFORM public.recalc_seller_trust(_user_id);
  SELECT * INTO _trust FROM public.seller_trust WHERE user_id = _user_id;

  _is_admin := public.has_role(_user_id, 'owner') OR public.has_role(_user_id, 'admin');

  IF _is_admin THEN
    -- Owner/admin: full instant release unless an explicit manual override is set.
    _instant := COALESCE(_trust.manual_override_pct, 100);
  ELSE
    _instant := COALESCE(_trust.manual_override_pct, _trust.instant_release_pct);
  END IF;

  SELECT COALESCE(SUM(
    CASE WHEN seller_payout_amount IS NOT NULL THEN (seller_payout_amount * 100)::bigint
         ELSE (amount * (1 - COALESCE(commission_rate,0.05)) * 100)::bigint END
  ),0) INTO _delivered_net
  FROM public.orders
  WHERE seller_id = _user_id
    AND status = 'delivered'
    AND payment_status = 'paid'
    AND COALESCE(refunded_amount,0) = 0
    AND payout_held = false;

  SELECT COALESCE(SUM(
    CASE WHEN seller_payout_amount IS NOT NULL THEN (seller_payout_amount * 100)::bigint
         ELSE (amount * (1 - COALESCE(commission_rate,0.05)) * 100)::bigint END
  ),0) INTO _undelivered_net
  FROM public.orders
  WHERE seller_id = _user_id
    AND status IN ('pending','shipped')
    AND payment_status = 'paid'
    AND COALESCE(refunded_amount,0) = 0
    AND payout_held = false
    AND id NOT IN (SELECT order_id FROM public.payout_locks WHERE released_at IS NULL);

  _instant_from_pending := (_undelivered_net * _instant) / 100;

  SELECT COALESCE(SUM(amount_cents),0) INTO _locked
    FROM public.payout_locks WHERE user_id = _user_id AND released_at IS NULL;

  SELECT COALESCE(SUM(amount_cents),0) INTO _inflight
    FROM public.payout_requests
    WHERE user_id = _user_id AND status IN ('requested','processing');

  SELECT COALESCE(SUM(balance_owed_cents),0) INTO _owed
    FROM public.account_holds WHERE user_id = _user_id AND status = 'active';

  available_cents := _delivered_net + _instant_from_pending;
  pending_cents   := _undelivered_net - _instant_from_pending;
  locked_cents    := _locked;
  in_flight_cents := _inflight;
  owed_cents      := _owed;
  payable_cents   := GREATEST(0, available_cents - _inflight - _owed);
  IF COALESCE(_trust.frozen,false) THEN payable_cents := 0; END IF;
  instant_pct := _instant;
  tier := _trust.tier;
  frozen := COALESCE(_trust.frozen,false);
  RETURN NEXT;
END $$;
GRANT EXECUTE ON FUNCTION public.compute_seller_payable(UUID) TO authenticated;
