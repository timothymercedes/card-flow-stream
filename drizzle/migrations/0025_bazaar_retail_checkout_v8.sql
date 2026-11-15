DO $$
DECLARE v_has_exact_constraint boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'public' AND t.relname = 'bazaar_product_variants' AND c.contype = 'u'
      AND (SELECT array_agg(a.attname::text ORDER BY k.n)
           FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, n)
           JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum) = ARRAY['id','product_id']
  ) INTO v_has_exact_constraint;
  IF NOT v_has_exact_constraint THEN
    ALTER TABLE public.bazaar_product_variants ADD CONSTRAINT uq_bazaar_product_variant UNIQUE (id, product_id);
    COMMENT ON CONSTRAINT uq_bazaar_product_variant ON public.bazaar_product_variants
      IS 'Created by Bazaar Retail Checkout V8 for order item referential integrity';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.bazaar_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text UNIQUE NOT NULL DEFAULT ('BZ-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  buyer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  store_id uuid NOT NULL REFERENCES public.bazaar_stores(id) ON DELETE RESTRICT,
  source text NOT NULL CHECK (source IN ('cart','buy_now')),
  status text NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('pending_payment','awaiting_fulfillment_approval','paid_inventory_exception','fulfillment_authorized','shipped','delivered','canceled','payment_failed','expired')),
  environment text NOT NULL CHECK (environment = 'sandbox'),
  currency text NOT NULL CHECK (currency = 'usd'),
  subtotal_cents integer NOT NULL CHECK (subtotal_cents > 0),
  shipping_cents integer NOT NULL DEFAULT 0 CHECK (shipping_cents >= 0),
  tax_cents integer NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  total_cents integer NOT NULL CHECK (total_cents > 0 AND total_cents = subtotal_cents + shipping_cents + tax_cents),
  tax_calculation_status text NOT NULL CHECK (tax_calculation_status IN ('quoted_verified','exempt_verified')),
  tax_provider text NOT NULL CHECK (tax_provider IN ('state_table','stripe_tax','exempt')),
  tax_jurisdiction text NOT NULL,
  tax_ruleset_version text NOT NULL DEFAULT 'v1_2026',
  tax_rate_bps integer NOT NULL DEFAULT 0 CHECK (tax_rate_bps >= 0),
  taxable_subtotal_cents integer NOT NULL DEFAULT 0 CHECK (taxable_subtotal_cents >= 0),
  tax_country text,
  tax_state text,
  tax_reconciliation_status text NOT NULL DEFAULT 'pending' CHECK (tax_reconciliation_status IN ('pending','reconciled')),
  shipping_name text, shipping_line1 text, shipping_line2 text, shipping_city text,
  shipping_region text, shipping_postal_code text, shipping_country text, shipping_phone text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_bazaar_tax_calculation_verified CHECK (
    length(trim(tax_jurisdiction)) >= 2 AND length(trim(tax_ruleset_version)) >= 2 AND (
      (tax_calculation_status = 'exempt_verified' AND tax_provider = 'exempt' AND tax_cents = 0) OR
      (tax_calculation_status = 'quoted_verified' AND tax_provider IN ('state_table','stripe_tax') AND tax_rate_bps >= 0)))
);

CREATE TABLE IF NOT EXISTS public.bazaar_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.bazaar_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.bazaar_products(id) ON DELETE RESTRICT,
  variant_id uuid NOT NULL REFERENCES public.bazaar_product_variants(id) ON DELETE RESTRICT,
  title text NOT NULL,
  variant_label text,
  sku text NOT NULL DEFAULT ('PB-BZ-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  image_url text,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 50),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents > 0),
  line_total_cents integer NOT NULL CHECK (line_total_cents = unit_price_cents * quantity),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_bazaar_order_items_product_variant FOREIGN KEY (variant_id, product_id) REFERENCES public.bazaar_product_variants(id, product_id) ON DELETE RESTRICT,
  CONSTRAINT chk_bazaar_order_item_sku CHECK (sku LIKE 'PB-BZ-%')
);

CREATE TABLE IF NOT EXISTS public.bazaar_inventory_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.bazaar_orders(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.bazaar_product_variants(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0),
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','consumed','released')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_bazaar_reservations_order_variant UNIQUE (order_id, variant_id)
);

CREATE TABLE IF NOT EXISTS public.bazaar_order_private_details (
  order_id uuid PRIMARY KEY REFERENCES public.bazaar_orders(id) ON DELETE CASCADE,
  stripe_checkout_session_id text UNIQUE,
  stripe_payment_intent_id text UNIQUE,
  idempotency_key text UNIQUE NOT NULL,
  verified_amount_cents integer,
  verified_currency text,
  landed_cost_cents integer,
  profit_cents integer,
  validation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bazaar_order_item_fulfillments (
  order_item_id uuid PRIMARY KEY REFERENCES public.bazaar_order_items(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.bazaar_suppliers(id),
  supplier_product_ref text,
  supplier_variant_ref text,
  supplier_unit_cost_cents integer,
  supplier_shipping_cents integer,
  status text NOT NULL DEFAULT 'awaiting_admin_authorization' CHECK (status IN ('awaiting_admin_authorization','authorized','submitted','fulfilled','canceled')),
  authorized_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  authorized_at timestamptz,
  supplier_order_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bazaar_orders_buyer_idx ON public.bazaar_orders(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bazaar_order_items_order_idx ON public.bazaar_order_items(order_id);
CREATE INDEX IF NOT EXISTS bazaar_reservations_variant_active_idx ON public.bazaar_inventory_reservations(variant_id, expires_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS bazaar_reservations_order_idx ON public.bazaar_inventory_reservations(order_id);

CREATE TRIGGER bazaar_orders_touch BEFORE UPDATE ON public.bazaar_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER bazaar_reservations_touch BEFORE UPDATE ON public.bazaar_inventory_reservations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER bazaar_order_private_touch BEFORE UPDATE ON public.bazaar_order_private_details FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER bazaar_order_fulfill_touch BEFORE UPDATE ON public.bazaar_order_item_fulfillments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.check_bazaar_order_store()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_direct_id uuid;
BEGIN
  SELECT id INTO v_direct_id FROM public.bazaar_stores WHERE slug = 'pb-bazaar-direct';
  IF v_direct_id IS NULL THEN
    RAISE EXCEPTION 'CONFIGURATION_ERROR: PB Bazaar Direct store record (slug: pb-bazaar-direct) is missing';
  END IF;
  IF NEW.store_id IS NULL OR NEW.store_id IS DISTINCT FROM v_direct_id THEN
    RAISE EXCEPTION 'INVALID_STORE: PB Bazaar orders must belong to PB Bazaar Direct (id: %)', v_direct_id;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.check_bazaar_order_store() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_bazaar_order_store_direct ON public.bazaar_orders;
CREATE TRIGGER trg_bazaar_order_store_direct BEFORE INSERT OR UPDATE OF store_id ON public.bazaar_orders
FOR EACH ROW EXECUTE FUNCTION public.check_bazaar_order_store();

REVOKE ALL ON public.bazaar_orders, public.bazaar_order_items, public.bazaar_inventory_reservations,
  public.bazaar_order_private_details, public.bazaar_order_item_fulfillments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.bazaar_orders, public.bazaar_order_items TO authenticated;
GRANT SELECT ON public.bazaar_order_item_fulfillments TO authenticated;
GRANT ALL ON public.bazaar_orders, public.bazaar_order_items, public.bazaar_inventory_reservations,
  public.bazaar_order_private_details, public.bazaar_order_item_fulfillments TO service_role;

ALTER TABLE public.bazaar_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bazaar_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bazaar_inventory_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bazaar_order_private_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bazaar_order_item_fulfillments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Buyer or admin reads bazaar orders" ON public.bazaar_orders FOR SELECT TO authenticated
  USING (buyer_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));
CREATE POLICY "Buyer or admin reads bazaar order items" ON public.bazaar_order_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bazaar_orders o WHERE o.id = order_id
    AND (o.buyer_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))));
CREATE POLICY "Admin reads bazaar fulfillments" ON public.bazaar_order_item_fulfillments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

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
      AND (s.slug <> 'pb-bazaar-direct' OR p.status <> 'published' OR s.status <> 'active')
  ) THEN
    RAISE EXCEPTION 'PRODUCT_NOT_SELLABLE: items must belong to active published PB Bazaar Direct store';
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

CREATE OR REPLACE FUNCTION public.bazaar_release_order_inventory(_order_id uuid, _target_status text DEFAULT 'canceled')
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_order public.bazaar_orders%ROWTYPE;
  v_count integer;
BEGIN
  IF _target_status IS NULL OR trim(_target_status) = '' THEN
    RAISE EXCEPTION 'TARGET_STATUS_REQUIRED: _target_status must not be null or empty';
  END IF;
  IF _target_status NOT IN ('canceled','payment_failed','expired') THEN
    RAISE EXCEPTION 'INVALID_RELEASE_STATUS: target status must be canceled, payment_failed, or expired (received: %)', _target_status;
  END IF;
  SELECT * INTO v_order FROM public.bazaar_orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF v_order.status <> 'pending_payment' THEN RETURN 0; END IF;
  UPDATE public.bazaar_orders SET status = _target_status, updated_at = now()
    WHERE id = _order_id AND status = 'pending_payment';
  UPDATE public.bazaar_inventory_reservations SET status = 'released', updated_at = now()
    WHERE order_id = _order_id AND status = 'active';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $$;
REVOKE ALL ON FUNCTION public.bazaar_release_order_inventory(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bazaar_release_order_inventory(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.bazaar_settle_order(
  _order_id uuid, _amount integer, _currency text, _stripe_checkout_session_id text, _stripe_payment_intent_id text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  o public.bazaar_orders%ROWTYPE;
  v_priv public.bazaar_order_private_details%ROWTYPE;
  v_calculated_subtotal integer;
  v_var record;
  v_req_qty integer;
  v_res_qty integer;
  v_short boolean := false;
  v_short_variant text := '';
  v_short_reason text := '';
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_SETTLEMENT_AMOUNT: _amount must be a positive integer';
  END IF;
  IF _currency IS NULL OR trim(_currency) = '' OR lower(trim(_currency)) <> 'usd' THEN
    RAISE EXCEPTION 'INVALID_SETTLEMENT_CURRENCY: _currency must be usd';
  END IF;
  IF _stripe_checkout_session_id IS NULL OR trim(_stripe_checkout_session_id) = '' THEN
    RAISE EXCEPTION 'CHECKOUT_SESSION_REQUIRED: settlement requires a valid Stripe Checkout Session ID';
  END IF;
  IF _stripe_payment_intent_id IS NULL OR trim(_stripe_payment_intent_id) = '' THEN
    RAISE EXCEPTION 'PAYMENT_INTENT_REQUIRED: settlement requires a valid Stripe Payment Intent ID';
  END IF;

  SELECT * INTO o FROM public.bazaar_orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND: %', _order_id; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.bazaar_order_items WHERE order_id = _order_id) THEN
    RAISE EXCEPTION 'EMPTY_ORDER: order % has no order items', _order_id;
  END IF;
  SELECT COALESCE(sum(line_total_cents),0)::integer INTO v_calculated_subtotal FROM public.bazaar_order_items WHERE order_id = _order_id;
  IF v_calculated_subtotal <> o.subtotal_cents THEN
    RAISE EXCEPTION 'SUBTOTAL_MISMATCH: order subtotal % does not match sum of items %', o.subtotal_cents, v_calculated_subtotal;
  END IF;
  IF _amount <> o.total_cents OR lower(trim(_currency)) <> lower(o.currency) THEN
    RAISE EXCEPTION 'AMOUNT_MISMATCH: expected % %, received % %', o.total_cents, o.currency, _amount, _currency;
  END IF;

  SELECT * INTO v_priv FROM public.bazaar_order_private_details WHERE order_id = _order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRIVATE_PAYMENT_DETAILS_MISSING: order % has no private payment details', _order_id;
  END IF;
  IF v_priv.stripe_checkout_session_id IS NULL OR v_priv.stripe_checkout_session_id <> _stripe_checkout_session_id THEN
    RAISE EXCEPTION 'CHECKOUT_SESSION_MISMATCH: stored %, received %', v_priv.stripe_checkout_session_id, _stripe_checkout_session_id;
  END IF;
  IF v_priv.stripe_payment_intent_id IS NOT NULL AND v_priv.stripe_payment_intent_id <> _stripe_payment_intent_id THEN
    RAISE EXCEPTION 'PAYMENT_INTENT_MISMATCH: stored %, received %', v_priv.stripe_payment_intent_id, _stripe_payment_intent_id;
  END IF;

  IF o.status IN ('awaiting_fulfillment_approval','paid_inventory_exception','fulfillment_authorized','shipped','delivered') THEN
    RETURN o.status;
  END IF;

  IF o.status IN ('canceled','expired','payment_failed') THEN
    UPDATE public.bazaar_orders SET status = 'paid_inventory_exception', paid_at = now(), updated_at = now() WHERE id = _order_id;
    UPDATE public.bazaar_order_private_details
    SET verified_amount_cents = _amount, verified_currency = lower(trim(_currency)),
        stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, _stripe_payment_intent_id),
        validation_snapshot = validation_snapshot || jsonb_build_object('late_payment_at', now(), 'previous_status', o.status, 'reason', 'verified_payment_received_after_' || o.status),
        updated_at = now()
    WHERE order_id = _order_id;
    RETURN 'paid_inventory_exception';
  END IF;

  IF o.status <> 'pending_payment' THEN
    RAISE EXCEPTION 'UNEXPECTED_ORDER_STATUS: order % is in status %', _order_id, o.status;
  END IF;

  FOR v_var IN
    SELECT id, quantity AS base_stock FROM public.bazaar_product_variants
    WHERE id IN (SELECT DISTINCT variant_id FROM public.bazaar_order_items WHERE order_id = _order_id)
    ORDER BY id ASC FOR UPDATE
  LOOP
    SELECT COALESCE(sum(quantity),0)::integer INTO v_req_qty FROM public.bazaar_order_items
      WHERE order_id = _order_id AND variant_id = v_var.id;
    SELECT quantity INTO v_res_qty FROM public.bazaar_inventory_reservations
      WHERE order_id = _order_id AND variant_id = v_var.id AND status = 'active' AND expires_at > now();
    IF NOT FOUND THEN
      v_short := true; v_short_variant := v_var.id::text; v_short_reason := 'reservation_missing_or_expired'; EXIT;
    ELSIF v_res_qty < v_req_qty THEN
      v_short := true; v_short_variant := v_var.id::text; v_short_reason := 'reserved_quantity_insufficient'; EXIT;
    ELSIF v_var.base_stock < v_req_qty THEN
      v_short := true; v_short_variant := v_var.id::text; v_short_reason := 'base_stock_insufficient'; EXIT;
    END IF;
  END LOOP;

  IF v_short THEN
    UPDATE public.bazaar_orders SET status = 'paid_inventory_exception', paid_at = now(), updated_at = now() WHERE id = _order_id;
    UPDATE public.bazaar_order_private_details
    SET verified_amount_cents = _amount, verified_currency = lower(trim(_currency)),
        stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, _stripe_payment_intent_id),
        validation_snapshot = validation_snapshot || jsonb_build_object('inventory_exception_at', now(), 'short_variant_id', v_short_variant, 'reason', v_short_reason),
        updated_at = now()
    WHERE order_id = _order_id;
    UPDATE public.bazaar_inventory_reservations SET status = 'released', updated_at = now()
      WHERE order_id = _order_id AND status = 'active';
    RETURN 'paid_inventory_exception';
  ELSE
    FOR v_var IN
      SELECT id FROM public.bazaar_product_variants
      WHERE id IN (SELECT DISTINCT variant_id FROM public.bazaar_order_items WHERE order_id = _order_id)
      ORDER BY id ASC
    LOOP
      SELECT COALESCE(sum(quantity),0)::integer INTO v_req_qty FROM public.bazaar_order_items
        WHERE order_id = _order_id AND variant_id = v_var.id;
      UPDATE public.bazaar_product_variants SET quantity = quantity - v_req_qty, updated_at = now() WHERE id = v_var.id;
    END LOOP;
    UPDATE public.bazaar_inventory_reservations SET status = 'consumed', updated_at = now()
      WHERE order_id = _order_id AND status = 'active';
    UPDATE public.bazaar_orders SET status = 'awaiting_fulfillment_approval', paid_at = now(), updated_at = now() WHERE id = _order_id;
    UPDATE public.bazaar_order_private_details
    SET verified_amount_cents = _amount, verified_currency = lower(trim(_currency)),
        stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, _stripe_payment_intent_id),
        updated_at = now()
    WHERE order_id = _order_id;
    RETURN 'awaiting_fulfillment_approval';
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.bazaar_settle_order(uuid, integer, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bazaar_settle_order(uuid, integer, text, text, text) TO service_role;