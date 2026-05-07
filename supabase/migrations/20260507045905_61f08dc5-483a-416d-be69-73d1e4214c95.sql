CREATE OR REPLACE FUNCTION public.orders_restrict_client_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_admin boolean;
BEGIN
  -- Bypass for service role / triggers without an auth context
  IF _uid IS NULL OR current_user IN ('postgres','supabase_admin','service_role','authenticator') THEN
    RETURN NEW;
  END IF;

  _is_admin := public.has_role(_uid,'admin') OR public.has_role(_uid,'owner');
  IF _is_admin THEN RETURN NEW; END IF;

  -- Immutable for everyone (buyer or seller)
  IF NEW.id <> OLD.id
     OR NEW.buyer_id <> OLD.buyer_id
     OR NEW.seller_id <> OLD.seller_id
     OR NEW.listing_id IS DISTINCT FROM OLD.listing_id
     OR NEW.stream_id IS DISTINCT FROM OLD.stream_id
     OR NEW.amount <> OLD.amount
     OR NEW.quantity <> OLD.quantity
     OR NEW.commission_rate <> OLD.commission_rate
     OR NEW.commission_amount IS DISTINCT FROM OLD.commission_amount
     OR NEW.seller_payout_amount IS DISTINCT FROM OLD.seller_payout_amount
     OR NEW.payment_status <> OLD.payment_status
     OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
     OR NEW.seller_stripe_account_id IS DISTINCT FROM OLD.seller_stripe_account_id
     OR NEW.title <> OLD.title
     OR NEW.created_at <> OLD.created_at
     OR NEW.order_group_id IS DISTINCT FROM OLD.order_group_id
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
    -- Buyers cannot touch fulfillment
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
    IF NEW.status NOT IN ('pending','shipped','delivered','cancelled','refunded','disputed') THEN
      RAISE EXCEPTION 'Invalid order status';
    END IF;
  ELSE
    RAISE EXCEPTION 'Not authorized to update this order';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_orders_restrict_client_update ON public.orders;
CREATE TRIGGER trg_orders_restrict_client_update
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.orders_restrict_client_update();

REVOKE ALL ON FUNCTION public.orders_restrict_client_update() FROM PUBLIC, anon, authenticated;