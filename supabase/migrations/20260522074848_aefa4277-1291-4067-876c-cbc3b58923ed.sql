ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS label_cost_cents bigint,
  ADD COLUMN IF NOT EXISTS shipping_margin_cents bigint;

CREATE OR REPLACE FUNCTION public.admin_shipping_margin(
  _since timestamptz DEFAULT NULL,
  _until timestamptz DEFAULT NULL
)
RETURNS TABLE(
  shipping_charged_cents bigint,
  label_cost_cents bigint,
  shipping_gross_margin_cents bigint,
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
  _label bigint;
  _adj_fees bigint;
  _adj_losses bigint;
BEGIN
  PERFORM _assert_owner();

  SELECT
    COALESCE(SUM((COALESCE(o.shipping_amount, 0) * 100)::bigint), 0)::bigint,
    COALESCE(SUM(COALESCE(o.label_cost_cents, 0)), 0)::bigint
  INTO _charged, _label
  FROM public.orders o
  WHERE o.payment_status = 'paid'
    AND (_since IS NULL OR o.created_at >= _since)
    AND (_until IS NULL OR o.created_at < _until);

  SELECT COALESCE(SUM(pr.amount_cents), 0)::bigint
  INTO _adj_fees
  FROM public.platform_revenue pr
  WHERE pr.kind = 'shipping_adjustment_fee'
    AND pr.amount_cents > 0
    AND (_since IS NULL OR pr.created_at >= _since)
    AND (_until IS NULL OR pr.created_at < _until);

  SELECT COALESCE(SUM(pr.amount_cents), 0)::bigint
  INTO _adj_losses
  FROM public.platform_revenue pr
  WHERE pr.kind = 'shipping_adjustment_fee'
    AND pr.amount_cents < 0
    AND (_since IS NULL OR pr.created_at >= _since)
    AND (_until IS NULL OR pr.created_at < _until);

  shipping_charged_cents := _charged;
  label_cost_cents := _label;
  shipping_gross_margin_cents := _charged - _label;
  adjustment_fees_cents := _adj_fees;
  adjustment_losses_cents := _adj_losses;
  net_shipping_margin_cents := (_charged - _label) + _adj_fees + _adj_losses;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_personal_sales_summary(
  _since timestamptz DEFAULT NULL,
  _until timestamptz DEFAULT NULL
)
RETURNS TABLE(
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
         COALESCE(SUM((o.amount * 100)::bigint), 0)::bigint,
         COALESCE(SUM((COALESCE(o.commission_amount, 0) * 100)::bigint), 0)::bigint,
         COALESCE(SUM((COALESCE(o.seller_payout_amount, 0) * 100)::bigint), 0)::bigint,
         COALESCE(SUM((COALESCE(o.refunded_amount, 0) * 100)::bigint), 0)::bigint
  FROM public.orders o
  WHERE o.seller_id = _uid
    AND o.payment_status = 'paid'
    AND (_since IS NULL OR o.created_at >= _since)
    AND (_until IS NULL OR o.created_at < _until);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_revenue_by_stream(
  _since timestamptz DEFAULT NULL,
  _until timestamptz DEFAULT NULL,
  _limit int DEFAULT 50
)
RETURNS TABLE(
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
         (SELECT s.title FROM public.live_streams s WHERE s.id = o.stream_id) AS stream_title,
         COUNT(*)::bigint AS order_count,
         COALESCE(SUM((o.amount * 100)::bigint), 0)::bigint AS gross_sales_cents,
         COALESCE(SUM((COALESCE(o.commission_amount, 0) * 100)::bigint), 0)::bigint AS commission_cents,
         COALESCE(SUM((COALESCE(o.shipping_amount, 0) * 100)::bigint), 0)::bigint AS shipping_cents
  FROM public.orders o
  WHERE o.stream_id IS NOT NULL
    AND o.payment_status = 'paid'
    AND (_since IS NULL OR o.created_at >= _since)
    AND (_until IS NULL OR o.created_at < _until)
  GROUP BY o.stream_id
  ORDER BY gross_sales_cents DESC
  LIMIT GREATEST(_limit, 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_revenue_by_seller(
  _since timestamptz DEFAULT NULL,
  _until timestamptz DEFAULT NULL,
  _limit int DEFAULT 50
)
RETURNS TABLE(
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
         (SELECT p.username FROM public.profiles p WHERE p.id = o.seller_id) AS username,
         COUNT(*)::bigint AS order_count,
         COALESCE(SUM((o.amount * 100)::bigint), 0)::bigint AS gross_sales_cents,
         COALESCE(SUM((COALESCE(o.commission_amount, 0) * 100)::bigint), 0)::bigint AS commission_cents,
         COALESCE(SUM((COALESCE(o.seller_payout_amount, 0) * 100)::bigint), 0)::bigint AS seller_payout_cents
  FROM public.orders o
  WHERE o.payment_status = 'paid'
    AND (_since IS NULL OR o.created_at >= _since)
    AND (_until IS NULL OR o.created_at < _until)
  GROUP BY o.seller_id
  ORDER BY commission_cents DESC
  LIMIT GREATEST(_limit, 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_shipping_margin(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_personal_sales_summary(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revenue_by_stream(timestamptz, timestamptz, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revenue_by_seller(timestamptz, timestamptz, int) TO authenticated;