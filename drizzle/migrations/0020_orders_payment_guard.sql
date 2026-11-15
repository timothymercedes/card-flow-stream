-- Migration: Hardening public.orders against client payment forgery and race-condition overselling

-- 1. Create client insert guard
CREATE OR REPLACE FUNCTION public.orders_guard_client_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _role text := auth.role();
  _listing record;
  _committed integer;
BEGIN
  -- Trusted backend check:
  -- 1. PostgREST API calls with service_role key (Stripe webhooks, server settlement)
  -- 2. Direct database connections (migrations, internal database maintenance)
  IF (_role = 'service_role' AND _uid IS NULL)
     OR session_user IN ('postgres', 'supabase_admin')
  THEN
    RETURN NEW;
  END IF;

  -- Block unauthenticated callers and anonymous requests
  IF _uid IS NULL OR _role = 'anon' OR _role IS NULL THEN
    RAISE EXCEPTION 'Authentication required to create orders';
  END IF;

  -- Client-created orders (including admin/owner sessions) must start awaiting_payment
  IF COALESCE(NEW.payment_status, 'awaiting_payment') <> 'awaiting_payment' THEN
    RAISE EXCEPTION 'Orders must be created unpaid; payment is confirmed by Stripe';
  END IF;

  IF NEW.paid_at IS NOT NULL THEN
    RAISE EXCEPTION 'paid_at cannot be set on client order creation';
  END IF;

  IF NEW.stripe_payment_intent_id IS NOT NULL THEN
    RAISE EXCEPTION 'stripe_payment_intent_id cannot be set on client order creation';
  END IF;

  IF NEW.stripe_charge_id IS NOT NULL THEN
    RAISE EXCEPTION 'stripe_charge_id cannot be set on client order creation';
  END IF;

  IF NEW.seller_stripe_account_id IS NOT NULL THEN
    RAISE EXCEPTION 'seller_stripe_account_id cannot be set on client order creation';
  END IF;

  IF NEW.tax_cents IS NOT NULL OR NEW.final_charged_total_cents IS NOT NULL THEN
    RAISE EXCEPTION 'Tax and charged totals cannot be set on client order creation';
  END IF;

  -- Quantity and monetary checks (amount must be strictly positive)
  IF COALESCE(NEW.quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'Order quantity must be greater than zero';
  END IF;

  IF COALESCE(NEW.amount, 0) <= 0 THEN
    RAISE EXCEPTION 'Order amount must be greater than zero';
  END IF;

  IF COALESCE(NEW.shipping_amount, 0) < 0 THEN
    RAISE EXCEPTION 'Shipping amount cannot be negative';
  END IF;

  -- Listing validation & inventory concurrency lock
  IF NEW.listing_id IS NOT NULL THEN
    SELECT price, quantity, status, user_id
    INTO _listing
    FROM public.listings
    WHERE id = NEW.listing_id
    FOR UPDATE;

    IF _listing.price IS NULL OR _listing.price <= 0 OR _listing.status <> 'active' THEN
      RAISE EXCEPTION 'Listing is unavailable or does not have a valid price';
    END IF;

    IF NEW.seller_id IS NOT NULL AND NEW.seller_id <> _listing.user_id THEN
      RAISE EXCEPTION 'Seller ID does not match listing owner';
    END IF;

    -- Verify amount covers listing price * quantity + shipping
    IF COALESCE(NEW.amount, 0) + 0.01 < (_listing.price * NEW.quantity) + COALESCE(NEW.shipping_amount, 0) THEN
      RAISE EXCEPTION 'Order amount does not match the listing price';
    END IF;

    -- Concurrency check: count paid + active reservations (< 24h)
    SELECT COALESCE(SUM(quantity), 0)
    INTO _committed
    FROM public.orders
    WHERE listing_id = NEW.listing_id
      AND (
        payment_status = 'paid'
        OR (payment_status = 'awaiting_payment' AND created_at >= now() - interval '24 hours')
      );

    IF (_committed + NEW.quantity) > COALESCE(_listing.quantity, 0) THEN
      RAISE EXCEPTION 'Insufficient listing inventory available';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.orders_guard_client_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_orders_guard_client_insert ON public.orders;
CREATE TRIGGER trg_orders_guard_client_insert
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_guard_client_insert();

-- 2. Enhanced orders_restrict_client_update with universal financial & identity immutability
CREATE OR REPLACE FUNCTION public.orders_restrict_client_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _role text := auth.role();
  _is_admin boolean;
BEGIN
  -- Trusted backend check: service_role key or direct database connection
  IF (_role = 'service_role' AND _uid IS NULL)
     OR session_user IN ('postgres', 'supabase_admin')
  THEN
    RETURN NEW;
  END IF;

  -- Block unauthenticated callers
  IF _uid IS NULL OR _role = 'anon' OR _role IS NULL THEN
    RAISE EXCEPTION 'Authentication required to update orders';
  END IF;

  -- Identity, financial totals, and Stripe accounting fields are immutable for ALL client sessions (including admin/owner)
  IF NEW.id <> OLD.id
     OR NEW.buyer_id <> OLD.buyer_id
     OR NEW.seller_id <> OLD.seller_id
     OR NEW.listing_id IS DISTINCT FROM OLD.listing_id
     OR NEW.amount <> OLD.amount
     OR NEW.shipping_amount <> OLD.shipping_amount
     OR NEW.quantity <> OLD.quantity
     OR NEW.commission_rate <> OLD.commission_rate
     OR NEW.commission_amount IS DISTINCT FROM OLD.commission_amount
     OR NEW.seller_payout_amount IS DISTINCT FROM OLD.seller_payout_amount
     OR NEW.seller_stripe_account_id IS DISTINCT FROM OLD.seller_stripe_account_id
     OR NEW.stripe_payment_intent_id IS DISTINCT FROM OLD.stripe_payment_intent_id
     OR NEW.stripe_charge_id IS DISTINCT FROM OLD.stripe_charge_id
     OR NEW.tax_cents IS DISTINCT FROM OLD.tax_cents
     OR NEW.final_charged_total_cents IS DISTINCT FROM OLD.final_charged_total_cents
     OR NEW.order_group_id IS DISTINCT FROM OLD.order_group_id
     OR NEW.created_at <> OLD.created_at
  THEN
    RAISE EXCEPTION 'Financial and identity fields cannot be modified';
  END IF;

  _is_admin := public.has_role(_uid, 'admin') OR public.has_role(_uid, 'owner');
  IF _is_admin THEN
    -- Admin clients cannot mark an unpaid order as paid or fabricate payment timestamps
    IF NEW.payment_status = 'paid' AND OLD.payment_status <> 'paid' THEN
      RAISE EXCEPTION 'Admin client cannot mark order paid directly; payment must be confirmed by Stripe';
    END IF;
    IF NEW.paid_at IS DISTINCT FROM OLD.paid_at AND OLD.paid_at IS NULL THEN
      RAISE EXCEPTION 'paid_at timestamp cannot be set by client';
    END IF;
    -- Legitimate administrative workflows (refunds, cancellations, fulfillment notes, stream detachment) are permitted
    RETURN NEW;
  END IF;

  -- Additional immutable fields for non-admin clients (buyers and sellers)
  IF NEW.stream_id IS DISTINCT FROM OLD.stream_id
     OR NEW.payment_status <> OLD.payment_status
     OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
     OR NEW.title <> OLD.title
  THEN
    RAISE EXCEPTION 'This field cannot be modified';
  END IF;

  IF _uid = OLD.buyer_id THEN
    -- Buyers may only edit shipping address fields, and only before payment
    IF OLD.payment_status <> 'awaiting_payment' THEN
      IF NEW.ship_name IS DISTINCT FROM OLD.ship_name
         OR NEW.ship_address IS DISTINCT FROM OLD.ship_address
         OR NEW.ship_city IS DISTINCT FROM OLD.ship_city
         OR NEW.ship_state IS DISTINCT FROM OLD.ship_state
         OR NEW.ship_zip IS DISTINCT FROM OLD.ship_zip
         OR NEW.ship_country IS DISTINCT FROM OLD.ship_country
      THEN
        RAISE EXCEPTION 'Shipping address is locked once the order is paid';
      END IF;
    END IF;

    -- Buyers cannot touch fulfillment fields
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.tracking_number IS DISTINCT FROM OLD.tracking_number
       OR NEW.tracking_url IS DISTINCT FROM OLD.tracking_url
       OR NEW.carrier IS DISTINCT FROM OLD.carrier
       OR NEW.shipped_at IS DISTINCT FROM OLD.shipped_at
       OR NEW.delivered_at IS DISTINCT FROM OLD.delivered_at
       OR NEW.condition IS DISTINCT FROM OLD.condition
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.item_image_url IS DISTINCT FROM OLD.item_image_url
    THEN
      RAISE EXCEPTION 'Buyers cannot modify fulfillment fields';
    END IF;
  ELSIF _uid = OLD.seller_id THEN
    -- Sellers may only edit fulfillment-related fields
    IF NEW.ship_name IS DISTINCT FROM OLD.ship_name
       OR NEW.ship_address IS DISTINCT FROM OLD.ship_address
       OR NEW.ship_city IS DISTINCT FROM OLD.ship_city
       OR NEW.ship_state IS DISTINCT FROM OLD.ship_state
       OR NEW.ship_zip IS DISTINCT FROM OLD.ship_zip
       OR NEW.ship_country IS DISTINCT FROM OLD.ship_country
    THEN
      RAISE EXCEPTION 'Sellers cannot modify the buyer''s shipping address';
    END IF;

    IF NEW.status NOT IN ('pending', 'shipped', 'delivered', 'cancelled', 'refunded', 'disputed') THEN
      RAISE EXCEPTION 'Invalid order status';
    END IF;
  ELSE
    RAISE EXCEPTION 'Not authorized to update this order';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.orders_restrict_client_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_orders_restrict_client_update ON public.orders;
CREATE TRIGGER trg_orders_restrict_client_update
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_restrict_client_update();

-- 3. Policy-layer alignment for INSERT
DROP POLICY IF EXISTS "Buyers create orders" ON public.orders;
CREATE POLICY "Buyers create orders" ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = buyer_id
    AND COALESCE(payment_status, 'awaiting_payment') = 'awaiting_payment'
    AND paid_at IS NULL
    AND stripe_payment_intent_id IS NULL
    AND stripe_charge_id IS NULL
    AND seller_stripe_account_id IS NULL
    AND COALESCE(amount, 0) > 0
    AND COALESCE(quantity, 0) > 0
    AND COALESCE(shipping_amount, 0) >= 0
  );
