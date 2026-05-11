
-- 1) Clear existing base64 image data from listings (already publicly exposed; redact).
UPDATE public.listings
SET image_url = NULL
WHERE image_url LIKE 'data:%';

UPDATE public.listings
SET back_image_url = NULL
WHERE back_image_url LIKE 'data:%';

-- 2) Trigger to block future base64 image inserts/updates on listings.
CREATE OR REPLACE FUNCTION public.listings_block_inline_images()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.image_url IS NOT NULL AND NEW.image_url LIKE 'data:%' THEN
    RAISE EXCEPTION 'Listing image_url must be a hosted URL, not inline base64 data. Upload via storage.';
  END IF;
  IF NEW.back_image_url IS NOT NULL AND NEW.back_image_url LIKE 'data:%' THEN
    RAISE EXCEPTION 'Listing back_image_url must be a hosted URL, not inline base64 data. Upload via storage.';
  END IF;
  -- Reasonable URL length sanity check
  IF NEW.image_url IS NOT NULL AND length(NEW.image_url) > 2000 THEN
    RAISE EXCEPTION 'image_url too long';
  END IF;
  IF NEW.back_image_url IS NOT NULL AND length(NEW.back_image_url) > 2000 THEN
    RAISE EXCEPTION 'back_image_url too long';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_listings_block_inline_images ON public.listings;
CREATE TRIGGER trg_listings_block_inline_images
BEFORE INSERT OR UPDATE ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.listings_block_inline_images();

-- 3) Add explicit public-read SELECT policy on order-snapshots
-- (bucket is intentionally public — files serve as item images on live streams/orders).
CREATE POLICY "Public read order-snapshots"
ON storage.objects FOR SELECT
USING (bucket_id = 'order-snapshots');
