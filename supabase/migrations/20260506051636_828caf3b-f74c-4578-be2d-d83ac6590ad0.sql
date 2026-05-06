-- Inventory + cart support
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS sold_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.listings
  ADD CONSTRAINT listings_quantity_positive CHECK (quantity >= 1),
  ADD CONSTRAINT listings_sold_count_nonneg CHECK (sold_count >= 0);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_quantity_positive CHECK (quantity >= 1);

-- Function: when an order moves to payment_status='paid' and is tied to a listing,
-- increment that listing's sold_count by the order's quantity (idempotent via paid_at guard).
CREATE OR REPLACE FUNCTION public.bump_listing_sold_on_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.listing_id IS NOT NULL
     AND NEW.payment_status = 'paid'
     AND COALESCE(OLD.payment_status, '') <> 'paid' THEN
    UPDATE public.listings
       SET sold_count = LEAST(quantity, sold_count + COALESCE(NEW.quantity, 1))
     WHERE id = NEW.listing_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_listing_sold_on_paid ON public.orders;
CREATE TRIGGER trg_bump_listing_sold_on_paid
AFTER UPDATE OF payment_status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.bump_listing_sold_on_paid();

-- Also bump on INSERT when order created already paid (rare, but for completeness)
CREATE OR REPLACE FUNCTION public.bump_listing_sold_on_insert_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.listing_id IS NOT NULL AND NEW.payment_status = 'paid' THEN
    UPDATE public.listings
       SET sold_count = LEAST(quantity, sold_count + COALESCE(NEW.quantity, 1))
     WHERE id = NEW.listing_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_listing_sold_on_insert ON public.orders;
CREATE TRIGGER trg_bump_listing_sold_on_insert
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.bump_listing_sold_on_insert_paid();

-- Validate that we don't oversell when adding to cart / placing an order.
-- Counts paid + awaiting_payment quantities for this listing and refuses
-- if it would exceed listings.quantity.
CREATE OR REPLACE FUNCTION public.validate_order_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _listing_qty integer;
  _committed integer;
BEGIN
  IF NEW.listing_id IS NULL THEN RETURN NEW; END IF;
  SELECT quantity INTO _listing_qty FROM public.listings WHERE id = NEW.listing_id;
  IF _listing_qty IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO _committed
    FROM public.orders
   WHERE listing_id = NEW.listing_id
     AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
     AND payment_status IN ('paid', 'awaiting_payment');

  IF _committed + COALESCE(NEW.quantity, 1) > _listing_qty THEN
    RAISE EXCEPTION 'Not enough inventory: only % left', GREATEST(0, _listing_qty - _committed);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_order_inventory ON public.orders;
CREATE TRIGGER trg_validate_order_inventory
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.validate_order_inventory();