-- Stream shipping service tier (Shippo) — host must pick one before going live.
ALTER TABLE public.live_streams
  ADD COLUMN IF NOT EXISTS shipping_service_tier text;

COMMENT ON COLUMN public.live_streams.shipping_service_tier IS
  'Shippo servicelevel token chosen by host for this stream (usps_ground_advantage, usps_priority, usps_priority_express, ups_ground). Required before going live.';

-- $7 USA per-stream shipping cap. Applied BEFORE INSERT on orders.
-- For orders tied to a live stream where the buyer ships to US:
--   - If buyer already paid >= $7 of shipping on prior PAID orders in this
--     stream → new order ships free.
--   - Otherwise → shipping is the lesser of (stream's configured
--     shipping_price) and (remaining headroom to the $7 cap).
-- Non-US / non-live orders are unchanged.
CREATE OR REPLACE FUNCTION public.apply_stream_shipping_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stream_ship  numeric;
  paid_so_far  numeric;
  headroom     numeric;
  cap          numeric := 7.00;
BEGIN
  IF NEW.stream_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only cap US-bound shipments.
  IF COALESCE(UPPER(NEW.ship_country), 'US') <> 'US' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(shipping_price, 0) INTO stream_ship
    FROM public.live_streams WHERE id = NEW.stream_id;

  IF stream_ship IS NULL THEN
    stream_ship := COALESCE(NEW.shipping_amount, 0);
  END IF;

  SELECT COALESCE(SUM(shipping_amount), 0) INTO paid_so_far
    FROM public.orders
   WHERE stream_id    = NEW.stream_id
     AND buyer_id     = NEW.buyer_id
     AND payment_status IN ('paid','processing','awaiting_payment','failed')
     AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  headroom := GREATEST(cap - paid_so_far, 0);

  IF headroom <= 0 THEN
    NEW.shipping_amount := 0;
  ELSE
    NEW.shipping_amount := LEAST(stream_ship, headroom);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_stream_shipping_cap ON public.orders;
CREATE TRIGGER trg_apply_stream_shipping_cap
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_stream_shipping_cap();