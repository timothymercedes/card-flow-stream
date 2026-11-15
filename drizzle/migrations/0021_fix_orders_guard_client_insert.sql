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
  IF (_role = 'service_role' AND _uid IS NULL)
     OR session_user IN ('postgres', 'supabase_admin')
  THEN
    RETURN NEW;
  END IF;

  IF _uid IS NULL OR _role = 'anon' OR _role IS NULL THEN
    RAISE EXCEPTION 'Authentication required to create orders';
  END IF;

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

  IF COALESCE(NEW.tax_cents,0) <> 0 OR COALESCE(NEW.final_charged_total_cents,0) <> 0 THEN
    RAISE EXCEPTION 'Tax and charged totals cannot be set on client order creation';
  END IF;

  IF NEW.commission_amount IS NOT NULL OR NEW.seller_payout_amount IS NOT NULL THEN
    RAISE EXCEPTION 'Commission and payout amounts cannot be set on client order creation';
  END IF;

  IF COALESCE(NEW.quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'Order quantity must be greater than zero';
  END IF;

  IF COALESCE(NEW.amount, 0) <= 0 THEN
    RAISE EXCEPTION 'Order amount must be greater than zero';
  END IF;

  IF COALESCE(NEW.shipping_amount, 0) < 0 THEN
    RAISE EXCEPTION 'Shipping amount cannot be negative';
  END IF;

  IF NEW.listing_id IS NOT NULL THEN
    SELECT price, quantity, seller_id
    INTO _listing
    FROM public.listings
    WHERE id = NEW.listing_id
    FOR UPDATE;

    IF NOT FOUND OR _listing.price IS NULL OR _listing.price <= 0 THEN
      RAISE EXCEPTION 'Listing is unavailable or does not have a valid price';
    END IF;

    IF NEW.seller_id IS NOT NULL AND NEW.seller_id <> _listing.seller_id THEN
      RAISE EXCEPTION 'Seller ID does not match listing owner';
    END IF;

    IF COALESCE(NEW.amount, 0) + 0.01 < (_listing.price * NEW.quantity) + COALESCE(NEW.shipping_amount, 0) THEN
      RAISE EXCEPTION 'Order amount does not match the listing price';
    END IF;

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