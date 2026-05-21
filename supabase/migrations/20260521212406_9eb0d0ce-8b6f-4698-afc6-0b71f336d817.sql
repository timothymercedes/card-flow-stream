
-- 1. Alerts table
CREATE TABLE IF NOT EXISTS public.financial_integrity_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  kind text NOT NULL,
  order_id uuid,
  amount_cents bigint,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_at timestamptz,
  resolved_by uuid
);

CREATE INDEX IF NOT EXISTS idx_fia_created ON public.financial_integrity_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fia_unresolved ON public.financial_integrity_alerts(created_at DESC) WHERE resolved_at IS NULL;

ALTER TABLE public.financial_integrity_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owners view alerts" ON public.financial_integrity_alerts;
CREATE POLICY "owners view alerts" ON public.financial_integrity_alerts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

DROP POLICY IF EXISTS "owners update alerts" ON public.financial_integrity_alerts;
CREATE POLICY "owners update alerts" ON public.financial_integrity_alerts
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

-- 2. Real-time guardrail on orders: paid orders must reconcile
CREATE OR REPLACE FUNCTION public.assert_order_payout_consistent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _subtotal numeric;
  _commission numeric;
  _payout numeric;
  _drift numeric;
BEGIN
  IF NEW.payment_status <> 'paid' THEN
    RETURN NEW;
  END IF;
  IF NEW.commission_amount IS NULL OR NEW.seller_payout_amount IS NULL THEN
    RETURN NEW; -- legacy/in-flight rows, scrubbed by reconciliation
  END IF;

  _subtotal := COALESCE(NEW.amount, 0) - COALESCE(NEW.shipping_amount, 0);
  _commission := COALESCE(NEW.commission_amount, 0);
  _payout := COALESCE(NEW.seller_payout_amount, 0);
  _drift := ABS((_commission + _payout) - _subtotal);

  -- Allow 2 cents of rounding drift
  IF _drift > 0.02 THEN
    RAISE EXCEPTION 'order % payout inconsistent: subtotal=% commission=% payout=% drift=%',
      NEW.id, _subtotal, _commission, _payout, _drift;
  END IF;

  IF _payout > _subtotal + 0.02 THEN
    RAISE EXCEPTION 'order % seller payout (%) exceeds subtotal (%)', NEW.id, _payout, _subtotal;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_payout_consistent ON public.orders;
CREATE TRIGGER trg_orders_payout_consistent
  BEFORE INSERT OR UPDATE OF payment_status, amount, shipping_amount, commission_amount, seller_payout_amount
  ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.assert_order_payout_consistent();

-- 3. Real-time guardrail on platform_revenue: shipping_margin must reference an order
CREATE OR REPLACE FUNCTION public.assert_platform_revenue_traceable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.kind IN ('shipping_margin','marketplace_commission','intl_processing_fee','stripe_processing_fee')
     AND NEW.order_id IS NULL THEN
    RAISE EXCEPTION 'platform_revenue.% requires order_id', NEW.kind;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_platform_revenue_traceable ON public.platform_revenue;
CREATE TRIGGER trg_platform_revenue_traceable
  BEFORE INSERT ON public.platform_revenue
  FOR EACH ROW EXECUTE FUNCTION public.assert_platform_revenue_traceable();

-- 4. Nightly reconciliation RPC
CREATE OR REPLACE FUNCTION public.run_financial_reconciliation(
  _since timestamptz DEFAULT now() - interval '7 days'
)
RETURNS TABLE(
  scanned_orders bigint,
  missing_commission bigint,
  missing_shipping_margin bigint,
  payout_drift bigint,
  new_alerts bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _scanned bigint := 0;
  _missing_comm bigint := 0;
  _missing_ship bigint := 0;
  _drift bigint := 0;
  _alerts bigint := 0;
  _row record;
BEGIN
  SELECT COUNT(*) INTO _scanned
  FROM orders WHERE payment_status='paid' AND created_at >= _since;

  -- Missing commission ledger row
  FOR _row IN
    SELECT o.id, o.amount, o.shipping_amount, o.commission_amount
    FROM orders o
    LEFT JOIN platform_revenue pr
      ON pr.order_id = o.id AND pr.kind = 'marketplace_commission'
    WHERE o.payment_status='paid'
      AND o.created_at >= _since
      AND COALESCE(o.commission_amount,0) > 0
      AND pr.id IS NULL
  LOOP
    _missing_comm := _missing_comm + 1;
    INSERT INTO financial_integrity_alerts(severity, kind, order_id, amount_cents, details)
    SELECT 'warning','missing_commission_ledger', _row.id,
           (_row.commission_amount * 100)::bigint,
           jsonb_build_object('subtotal', _row.amount - _row.shipping_amount)
    WHERE NOT EXISTS (
      SELECT 1 FROM financial_integrity_alerts
      WHERE kind='missing_commission_ledger' AND order_id = _row.id AND resolved_at IS NULL
    );
    _alerts := _alerts + 1;
  END LOOP;

  -- Missing shipping margin row (only for orders that have a real label)
  FOR _row IN
    SELECT o.id, o.shipping_amount, o.label_cost_cents
    FROM orders o
    LEFT JOIN platform_revenue pr
      ON pr.order_id = o.id AND pr.kind = 'shipping_margin'
    WHERE o.payment_status='paid'
      AND o.created_at >= _since
      AND o.label_purchased_at IS NOT NULL
      AND pr.id IS NULL
  LOOP
    _missing_ship := _missing_ship + 1;
    INSERT INTO financial_integrity_alerts(severity, kind, order_id, amount_cents, details)
    SELECT 'warning','missing_shipping_margin', _row.id, _row.label_cost_cents,
           jsonb_build_object('shipping_charged_cents',(_row.shipping_amount*100)::int)
    WHERE NOT EXISTS (
      SELECT 1 FROM financial_integrity_alerts
      WHERE kind='missing_shipping_margin' AND order_id = _row.id AND resolved_at IS NULL
    );
    _alerts := _alerts + 1;
  END LOOP;

  -- Payout drift: commission + payout != subtotal
  FOR _row IN
    SELECT id, amount, shipping_amount, commission_amount, seller_payout_amount,
           ABS((COALESCE(commission_amount,0) + COALESCE(seller_payout_amount,0))
              - (COALESCE(amount,0) - COALESCE(shipping_amount,0))) AS drift
    FROM orders
    WHERE payment_status='paid'
      AND created_at >= _since
      AND commission_amount IS NOT NULL
      AND seller_payout_amount IS NOT NULL
      AND ABS((COALESCE(commission_amount,0) + COALESCE(seller_payout_amount,0))
            - (COALESCE(amount,0) - COALESCE(shipping_amount,0))) > 0.02
  LOOP
    _drift := _drift + 1;
    INSERT INTO financial_integrity_alerts(severity, kind, order_id, amount_cents, details)
    SELECT 'critical','payout_drift', _row.id, (_row.drift*100)::bigint,
           jsonb_build_object(
             'subtotal', _row.amount - _row.shipping_amount,
             'commission', _row.commission_amount,
             'payout', _row.seller_payout_amount
           )
    WHERE NOT EXISTS (
      SELECT 1 FROM financial_integrity_alerts
      WHERE kind='payout_drift' AND order_id = _row.id AND resolved_at IS NULL
    );
    _alerts := _alerts + 1;
  END LOOP;

  scanned_orders := _scanned;
  missing_commission := _missing_comm;
  missing_shipping_margin := _missing_ship;
  payout_drift := _drift;
  new_alerts := _alerts;
  RETURN NEXT;
END;
$$;

-- Owner-only invoker wrapper for the admin UI
CREATE OR REPLACE FUNCTION public.admin_run_financial_reconciliation(_since timestamptz DEFAULT NULL)
RETURNS TABLE(
  scanned_orders bigint,
  missing_commission bigint,
  missing_shipping_margin bigint,
  payout_drift bigint,
  new_alerts bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM _assert_owner();
  RETURN QUERY SELECT * FROM public.run_financial_reconciliation(
    COALESCE(_since, now() - interval '7 days')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_integrity_alerts(_limit int DEFAULT 100, _only_unresolved boolean DEFAULT true)
RETURNS SETOF financial_integrity_alerts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM _assert_owner();
  RETURN QUERY
    SELECT * FROM financial_integrity_alerts
    WHERE (NOT _only_unresolved OR resolved_at IS NULL)
    ORDER BY created_at DESC
    LIMIT _limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_resolve_integrity_alert(_alert_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM _assert_owner();
  UPDATE financial_integrity_alerts
  SET resolved_at = now(), resolved_by = auth.uid()
  WHERE id = _alert_id;
END;
$$;
