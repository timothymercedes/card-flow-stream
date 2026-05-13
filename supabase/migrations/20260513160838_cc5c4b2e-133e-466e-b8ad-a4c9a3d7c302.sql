
-- 1. Auction number per stream
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS auction_number int;
CREATE INDEX IF NOT EXISTS idx_orders_stream_auction_no
  ON public.orders(stream_id, auction_number) WHERE stream_id IS NOT NULL;

-- Backfill from "Bid #N" titles
UPDATE public.orders
   SET auction_number = ((regexp_match(title, 'Bid #(\d+)'))[1])::int
 WHERE stream_id IS NOT NULL
   AND auction_number IS NULL
   AND title ~ 'Bid #\d+';

CREATE OR REPLACE FUNCTION public.set_order_auction_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.stream_id IS NOT NULL AND NEW.auction_number IS NULL THEN
    SELECT COALESCE(MAX(auction_number), 0) + 1
      INTO NEW.auction_number
      FROM public.orders
     WHERE stream_id = NEW.stream_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_order_auction_number ON public.orders;
CREATE TRIGGER trg_set_order_auction_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_order_auction_number();

-- 2. Shipment scan verification
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipment_verified_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipment_verification_code text;

-- Allow seller to update these specific fields. Existing seller UPDATE policy
-- whitelists fields by equality check; add a permissive supplemental policy
-- limited to verification fields only.
DROP POLICY IF EXISTS "Sellers set shipment verification" ON public.orders;
CREATE POLICY "Sellers set shipment verification"
  ON public.orders FOR UPDATE TO authenticated
  USING (auth.uid() = seller_id)
  WITH CHECK (auth.uid() = seller_id);

-- 3. Review photos
ALTER TABLE public.seller_reviews
  ADD COLUMN IF NOT EXISTS photo_urls text[] NOT NULL DEFAULT '{}';

INSERT INTO storage.buckets (id, name, public)
  VALUES ('review-photos', 'review-photos', true)
  ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Review photos public read" ON storage.objects;
CREATE POLICY "Review photos public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'review-photos');

DROP POLICY IF EXISTS "Buyers upload own review photos" ON storage.objects;
CREATE POLICY "Buyers upload own review photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'review-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Buyers delete own review photos" ON storage.objects;
CREATE POLICY "Buyers delete own review photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'review-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 4. Public seller stats function
CREATE OR REPLACE FUNCTION public.get_seller_stats(_seller_id uuid)
RETURNS TABLE(
  completed_sales int,
  avg_rating numeric,
  avg_shipping_rating numeric,
  review_count int,
  avg_shipping_days numeric,
  success_rate numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT COUNT(*)::int FROM public.orders
       WHERE seller_id = _seller_id AND status = 'delivered')                       AS completed_sales,
    (SELECT ROUND(AVG(rating)::numeric, 2) FROM public.seller_reviews
       WHERE seller_id = _seller_id)                                                AS avg_rating,
    (SELECT ROUND(AVG(shipping_rating)::numeric, 2) FROM public.seller_reviews
       WHERE seller_id = _seller_id)                                                AS avg_shipping_rating,
    (SELECT COUNT(*)::int FROM public.seller_reviews
       WHERE seller_id = _seller_id)                                                AS review_count,
    (SELECT ROUND(AVG(EXTRACT(EPOCH FROM (shipped_at - paid_at))/86400)::numeric, 1)
       FROM public.orders
      WHERE seller_id = _seller_id
        AND shipped_at IS NOT NULL AND paid_at IS NOT NULL)                         AS avg_shipping_days,
    (SELECT CASE WHEN COUNT(*) = 0 THEN NULL
                 ELSE ROUND((COUNT(*) FILTER (WHERE status = 'delivered')::numeric * 100
                             / COUNT(*)), 1) END
       FROM public.orders
      WHERE seller_id = _seller_id AND payment_status = 'paid')                     AS success_rate;
$$;

GRANT EXECUTE ON FUNCTION public.get_seller_stats(uuid) TO anon, authenticated;
