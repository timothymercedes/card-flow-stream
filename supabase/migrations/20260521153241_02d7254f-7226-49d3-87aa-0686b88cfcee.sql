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
         (SELECT s.title FROM live_streams s WHERE s.id = o.stream_id) AS stream_title,
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