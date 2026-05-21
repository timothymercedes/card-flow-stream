
DROP FUNCTION IF EXISTS public.admin_shipping_margin(timestamptz, timestamptz);

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
    COALESCE(SUM((COALESCE(o.shipping_amount,0) * 100)::bigint), 0),
    COALESCE(SUM(COALESCE(o.label_cost_cents,0))::bigint, 0)
  INTO _charged, _label
  FROM orders o
  WHERE o.payment_status = 'paid'
    AND (_since IS NULL OR o.created_at >= _since)
    AND (_until IS NULL OR o.created_at <  _until);

  SELECT COALESCE(SUM(amount_cents),0) INTO _adj_fees
  FROM platform_revenue
  WHERE kind = 'shipping_adjustment_fee' AND amount_cents > 0
    AND (_since IS NULL OR created_at >= _since)
    AND (_until IS NULL OR created_at <  _until);

  SELECT COALESCE(SUM(amount_cents),0) INTO _adj_losses
  FROM platform_revenue
  WHERE kind = 'shipping_adjustment_fee' AND amount_cents < 0
    AND (_since IS NULL OR created_at >= _since)
    AND (_until IS NULL OR created_at <  _until);

  shipping_charged_cents := _charged;
  label_cost_cents := _label;
  shipping_gross_margin_cents := _charged - _label;
  adjustment_fees_cents := _adj_fees;
  adjustment_losses_cents := _adj_losses;
  net_shipping_margin_cents := (_charged - _label) + _adj_fees + _adj_losses;
  RETURN NEXT;
END;
$$;
