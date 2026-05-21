
-- Platform-level payouts (owner-only, distinct from seller payout_requests)
CREATE TABLE IF NOT EXISTS public.platform_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL DEFAULT 'usd',
  status payout_status NOT NULL DEFAULT 'requested',
  destination text NOT NULL CHECK (destination IN ('platform_bank','owner_personal')),
  stripe_payout_id text,
  notes text,
  failure_reason text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_payouts_created_at
  ON public.platform_payouts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_payouts_status
  ON public.platform_payouts (status);

ALTER TABLE public.platform_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner read platform payouts" ON public.platform_payouts;
CREATE POLICY "owner read platform payouts"
  ON public.platform_payouts FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role));

DROP POLICY IF EXISTS "no client insert platform payouts" ON public.platform_payouts;
CREATE POLICY "no client insert platform payouts"
  ON public.platform_payouts FOR INSERT TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "no client update platform payouts" ON public.platform_payouts;
CREATE POLICY "no client update platform payouts"
  ON public.platform_payouts FOR UPDATE TO authenticated
  USING (false);

DROP POLICY IF EXISTS "no client delete platform payouts" ON public.platform_payouts;
CREATE POLICY "no client delete platform payouts"
  ON public.platform_payouts FOR DELETE TO authenticated
  USING (false);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_platform_payouts_updated ON public.platform_payouts;
CREATE TRIGGER trg_platform_payouts_updated
  BEFORE UPDATE ON public.platform_payouts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

-- ============================================================================
-- Owner-only assertion helper
-- ============================================================================
CREATE OR REPLACE FUNCTION public._assert_owner()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'owner'::app_role) THEN
    RAISE EXCEPTION 'forbidden: owner role required';
  END IF;
END;
$$;

-- ============================================================================
-- Revenue by period (day/week/month/year buckets)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_revenue_by_period(
  _bucket text,
  _since timestamptz DEFAULT NULL,
  _until timestamptz DEFAULT NULL
)
RETURNS TABLE (
  bucket_start timestamptz,
  gross_cents bigint,
  losses_cents bigint,
  net_cents bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _trunc text;
BEGIN
  PERFORM _assert_owner();
  IF _bucket NOT IN ('day','week','month','year') THEN
    RAISE EXCEPTION 'invalid bucket';
  END IF;
  _trunc := _bucket;

  RETURN QUERY EXECUTE format($f$
    SELECT date_trunc(%L, created_at) AS bucket_start,
           COALESCE(SUM(CASE WHEN amount_cents >= 0 THEN amount_cents ELSE 0 END), 0)::bigint AS gross_cents,
           COALESCE(SUM(CASE WHEN amount_cents <  0 THEN amount_cents ELSE 0 END), 0)::bigint AS losses_cents,
           COALESCE(SUM(amount_cents), 0)::bigint AS net_cents
    FROM platform_revenue
    WHERE ($1 IS NULL OR created_at >= $1)
      AND ($2 IS NULL OR created_at <  $2)
    GROUP BY 1
    ORDER BY 1 ASC
  $f$, _trunc) USING _since, _until;
END;
$$;

-- ============================================================================
-- Revenue by stream
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_revenue_by_stream(
  _since timestamptz DEFAULT NULL,
  _until timestamptz DEFAULT NULL,
  _limit int DEFAULT 50
)
RETURNS TABLE (
  stream_id uuid,
  stream_title text,
  order_count bigint,
  gross_sales_cents bigint,
  commission_cents bigint,
  shipping_cents bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM _assert_owner();
  RETURN QUERY
  SELECT o.stream_id,
         (SELECT s.title FROM streams s WHERE s.id = o.stream_id) AS stream_title,
         COUNT(*)::bigint AS order_count,
         COALESCE(SUM((o.amount * 100)::bigint), 0) AS gross_sales_cents,
         COALESCE(SUM((COALESCE(o.commission_amount, 0) * 100)::bigint), 0) AS commission_cents,
         COALESCE(SUM((COALESCE(o.shipping_amount, 0) * 100)::bigint), 0) AS shipping_cents
  FROM orders o
  WHERE o.stream_id IS NOT NULL
    AND o.payment_status = 'paid'
    AND (_since IS NULL OR o.created_at >= _since)
    AND (_until IS NULL OR o.created_at <  _until)
  GROUP BY o.stream_id
  ORDER BY gross_sales_cents DESC
  LIMIT GREATEST(_limit, 1);
END;
$$;

-- ============================================================================
-- Revenue by seller
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_revenue_by_seller(
  _since timestamptz DEFAULT NULL,
  _until timestamptz DEFAULT NULL,
  _limit int DEFAULT 50
)
RETURNS TABLE (
  seller_id uuid,
  username text,
  order_count bigint,
  gross_sales_cents bigint,
  commission_cents bigint,
  seller_payout_cents bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM _assert_owner();
  RETURN QUERY
  SELECT o.seller_id,
         (SELECT p.username FROM profiles p WHERE p.id = o.seller_id) AS username,
         COUNT(*)::bigint AS order_count,
         COALESCE(SUM((o.amount * 100)::bigint), 0) AS gross_sales_cents,
         COALESCE(SUM((COALESCE(o.commission_amount, 0) * 100)::bigint), 0) AS commission_cents,
         COALESCE(SUM((COALESCE(o.seller_payout_amount, 0) * 100)::bigint), 0) AS seller_payout_cents
  FROM orders o
  WHERE o.payment_status = 'paid'
    AND (_since IS NULL OR o.created_at >= _since)
    AND (_until IS NULL OR o.created_at <  _until)
  GROUP BY o.seller_id
  ORDER BY commission_cents DESC
  LIMIT GREATEST(_limit, 1);
END;
$$;

-- ============================================================================
-- Shipping margin summary (charged - label cost; label adjustments are losses)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_shipping_margin(
  _since timestamptz DEFAULT NULL,
  _until timestamptz DEFAULT NULL
)
RETURNS TABLE (
  shipping_charged_cents bigint,
  adjustment_fees_cents bigint,
  adjustment_losses_cents bigint,
  net_shipping_margin_cents bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _charged bigint;
  _adj_fees bigint;
  _adj_losses bigint;
BEGIN
  PERFORM _assert_owner();

  SELECT COALESCE(SUM((COALESCE(o.shipping_amount, 0) * 100)::bigint), 0)
    INTO _charged
  FROM orders o
  WHERE o.payment_status = 'paid'
    AND (_since IS NULL OR o.created_at >= _since)
    AND (_until IS NULL OR o.created_at <  _until);

  SELECT COALESCE(SUM(amount_cents), 0)
    INTO _adj_fees
  FROM platform_revenue
  WHERE kind = 'shipping_adjustment_fee'
    AND amount_cents > 0
    AND (_since IS NULL OR created_at >= _since)
    AND (_until IS NULL OR created_at <  _until);

  SELECT COALESCE(SUM(amount_cents), 0)
    INTO _adj_losses
  FROM platform_revenue
  WHERE kind = 'shipping_adjustment_fee'
    AND amount_cents < 0
    AND (_since IS NULL OR created_at >= _since)
    AND (_until IS NULL OR created_at <  _until);

  shipping_charged_cents := _charged;
  adjustment_fees_cents := _adj_fees;
  adjustment_losses_cents := _adj_losses;
  net_shipping_margin_cents := _charged + _adj_fees + _adj_losses;
  RETURN NEXT;
END;
$$;

-- ============================================================================
-- Owner's personal seller activity summary
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_personal_sales_summary(
  _since timestamptz DEFAULT NULL,
  _until timestamptz DEFAULT NULL
)
RETURNS TABLE (
  order_count bigint,
  gross_sales_cents bigint,
  commission_paid_cents bigint,
  net_payout_cents bigint,
  refunded_cents bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  PERFORM _assert_owner();
  RETURN QUERY
  SELECT COUNT(*)::bigint,
         COALESCE(SUM((o.amount * 100)::bigint), 0),
         COALESCE(SUM((COALESCE(o.commission_amount, 0) * 100)::bigint), 0),
         COALESCE(SUM((COALESCE(o.seller_payout_amount, 0) * 100)::bigint), 0),
         COALESCE(SUM((COALESCE(o.refunded_amount, 0) * 100)::bigint), 0)
  FROM orders o
  WHERE o.seller_id = _uid
    AND o.payment_status = 'paid'
    AND (_since IS NULL OR o.created_at >= _since)
    AND (_until IS NULL OR o.created_at <  _until);
END;
$$;

-- ============================================================================
-- Platform available balance (net earnings minus prior platform payouts)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.compute_platform_available()
RETURNS TABLE (
  net_earnings_cents bigint,
  payouts_pending_cents bigint,
  payouts_completed_cents bigint,
  available_cents bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _net bigint;
  _pending bigint;
  _done bigint;
BEGIN
  PERFORM _assert_owner();

  SELECT COALESCE(SUM(amount_cents), 0) INTO _net FROM platform_revenue;
  SELECT COALESCE(SUM(amount_cents), 0) INTO _pending
    FROM platform_payouts WHERE status IN ('requested','processing');
  SELECT COALESCE(SUM(amount_cents), 0) INTO _done
    FROM platform_payouts WHERE status = 'completed';

  net_earnings_cents := _net;
  payouts_pending_cents := _pending;
  payouts_completed_cents := _done;
  available_cents := GREATEST(_net - _pending - _done, 0);
  RETURN NEXT;
END;
$$;

-- ============================================================================
-- Request a platform payout (owner only)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.request_platform_payout(
  _amount_cents bigint,
  _destination text,
  _notes text DEFAULT NULL
)
RETURNS public.platform_payouts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row platform_payouts;
  _avail bigint;
BEGIN
  PERFORM _assert_owner();
  IF _destination NOT IN ('platform_bank','owner_personal') THEN
    RAISE EXCEPTION 'invalid destination';
  END IF;
  IF _amount_cents IS NULL OR _amount_cents <= 0 THEN
    RAISE EXCEPTION 'invalid amount';
  END IF;

  SELECT available_cents INTO _avail FROM compute_platform_available();
  IF _amount_cents > _avail THEN
    RAISE EXCEPTION 'amount exceeds available platform balance';
  END IF;

  INSERT INTO platform_payouts (requested_by, amount_cents, destination, notes)
  VALUES (auth.uid(), _amount_cents, _destination, _notes)
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_revenue_by_period(text, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revenue_by_stream(timestamptz, timestamptz, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revenue_by_seller(timestamptz, timestamptz, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_shipping_margin(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_personal_sales_summary(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_platform_available() TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_platform_payout(bigint, text, text) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.platform_payouts;
