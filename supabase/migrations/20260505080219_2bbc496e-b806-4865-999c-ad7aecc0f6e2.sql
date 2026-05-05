
-- Add category to listings
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS category text;
CREATE INDEX IF NOT EXISTS idx_listings_category ON public.listings(category);

-- Storage bucket for listing photos (public for display)
INSERT INTO storage.buckets (id, name, public)
VALUES ('listing-images', 'listing-images', true)
ON CONFLICT (id) DO NOTHING;

-- Public read
CREATE POLICY "Listing images are publicly viewable"
ON storage.objects FOR SELECT
USING (bucket_id = 'listing-images');

-- Authenticated users upload to their own folder (first folder = auth uid)
CREATE POLICY "Users can upload their own listing images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'listing-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own listing images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'listing-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own listing images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'listing-images' AND auth.uid()::text = (storage.foldername(name))[1]);
