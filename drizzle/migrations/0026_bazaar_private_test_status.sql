ALTER TABLE public.bazaar_stores DROP CONSTRAINT bazaar_stores_status_check;
ALTER TABLE public.bazaar_stores ADD CONSTRAINT bazaar_stores_status_check
  CHECK (status IN ('draft','pending_review','active','rejected','suspended','closed','private_test'));
ALTER TABLE public.bazaar_products DROP CONSTRAINT bazaar_products_status_check;
ALTER TABLE public.bazaar_products ADD CONSTRAINT bazaar_products_status_check
  CHECK (status IN ('draft','in_review','published','paused','archived','private_test'));

CREATE OR REPLACE FUNCTION public.bazaar_reserve_order_inventory(_order_id uuid, _expires_at timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_order public.bazaar_orders%ROWTYPE;
  v_calculated_subtotal integer;
  v_var record;
  v_req_qty integer;
  v_available integer;
BEGIN
  SELECT * INTO v_order FROM public.bazaar_orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND: %', _order_id; END IF;
  IF v_order.status <> 'pending_payment' THEN
    RAISE EXCEPTION 'ORDER_NOT_PENDING: order % is in status %', _order_id, v_order.status;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bazaar_order_items WHERE order_id = _order_id) THEN
    RAISE EXCEPTION 'EMPTY_ORDER: order % has no order items', _order_id;
  END IF;
  SELECT COALESCE(sum(line_total_cents),0)::integer INTO v_calculated_subtotal FROM public.bazaar_order_items WHERE order_id = _order_id;
  IF v_calculated_subtotal <> v_order.subtotal_cents THEN
    RAISE EXCEPTION 'SUBTOTAL_MISMATCH: order subtotal % does not match sum of items %', v_order.subtotal_cents, v_calculated_subtotal;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.bazaar_order_items oi
    JOIN public.bazaar_products p ON p.id = oi.product_id
    JOIN public.bazaar_stores s ON s.id = p.store_id
    WHERE oi.order_id = _order_id
      AND (
        s.slug <> 'pb-bazaar-direct'
        OR NOT (
          (p.status = 'published' AND s.status = 'active')
          OR (v_order.environment = 'sandbox' AND p.status IN ('published','private_test') AND s.status IN ('active','private_test'))
        )
      )
  ) THEN
    RAISE EXCEPTION 'PRODUCT_NOT_SELLABLE: items must belong to active PB Bazaar Direct store or sandbox private_test';
  END IF;
  IF _expires_at IS NULL THEN RAISE EXCEPTION 'EXPIRATION_REQUIRED: _expires_at cannot be null'; END IF;
  IF date_trunc('second', _expires_at) IS DISTINCT FROM _expires_at THEN
    RAISE EXCEPTION 'INVALID_EXPIRATION_PRECISION: _expires_at must have whole-second precision without subseconds (received: %)', _expires_at;
  END IF;
  IF _expires_at <= (now() + interval '29 minutes') OR _expires_at > (now() + interval '36 minutes') THEN
    RAISE EXCEPTION 'INVALID_EXPIRATION_WINDOW: expiration must be 30-35 minutes from now (received: %)', _expires_at;
  END IF;
  FOR v_var IN
    SELECT id, quantity AS base_stock FROM public.bazaar_product_variants
    WHERE id IN (SELECT DISTINCT variant_id FROM public.bazaar_order_items WHERE order_id = _order_id)
    ORDER BY id ASC FOR UPDATE
  LOOP
    SELECT COALESCE(sum(quantity),0)::integer INTO v_req_qty FROM public.bazaar_order_items
      WHERE order_id = _order_id AND variant_id = v_var.id;
    SELECT COALESCE(sum(r.quantity),0) INTO v_available FROM public.bazaar_inventory_reservations r
      WHERE r.variant_id = v_var.id AND r.status = 'active' AND r.expires_at > now() AND r.order_id <> _order_id;
    IF (v_var.base_stock - v_available) < v_req_qty THEN
      RAISE EXCEPTION 'INSUFFICIENT_INVENTORY: variant % has % available, requested %', v_var.id, (v_var.base_stock - v_available), v_req_qty;
    END IF;
    INSERT INTO public.bazaar_inventory_reservations (order_id, variant_id, quantity, expires_at, status, created_at, updated_at)
    VALUES (_order_id, v_var.id, v_req_qty, _expires_at, 'active', now(), now())
    ON CONFLICT (order_id, variant_id) DO UPDATE
      SET quantity = EXCLUDED.quantity, expires_at = EXCLUDED.expires_at, status = 'active', updated_at = now();
  END LOOP;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.bazaar_reserve_order_inventory(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bazaar_reserve_order_inventory(uuid, timestamptz) TO service_role;