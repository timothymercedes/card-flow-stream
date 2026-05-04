-- profiles columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS address_line1 text,
  ADD COLUMN IF NOT EXISTS address_city text,
  ADD COLUMN IF NOT EXISTS address_state text,
  ADD COLUMN IF NOT EXISTS address_zip text,
  ADD COLUMN IF NOT EXISTS address_country text DEFAULT 'US',
  ADD COLUMN IF NOT EXISTS id_document_url text,
  ADD COLUMN IF NOT EXISTS id_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS seller_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS buyer_verified boolean NOT NULL DEFAULT false;

-- orders columns
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS item_image_url text,
  ADD COLUMN IF NOT EXISTS stream_id uuid,
  ADD COLUMN IF NOT EXISTS description text;

-- buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars','avatars',true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('id-documents','id-documents',false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('order-snapshots','order-snapshots',true) ON CONFLICT (id) DO NOTHING;

-- avatars policies
DROP POLICY IF EXISTS "Avatars public read" ON storage.objects;
CREATE POLICY "Avatars public read" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
DROP POLICY IF EXISTS "Avatars user upload" ON storage.objects;
CREATE POLICY "Avatars user upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "Avatars user update" ON storage.objects;
CREATE POLICY "Avatars user update" ON storage.objects FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "Avatars user delete" ON storage.objects;
CREATE POLICY "Avatars user delete" ON storage.objects FOR DELETE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- id-documents policies (private)
DROP POLICY IF EXISTS "ID owner read" ON storage.objects;
CREATE POLICY "ID owner read" ON storage.objects FOR SELECT USING (bucket_id = 'id-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "ID owner upload" ON storage.objects;
CREATE POLICY "ID owner upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'id-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "ID owner update" ON storage.objects;
CREATE POLICY "ID owner update" ON storage.objects FOR UPDATE USING (bucket_id = 'id-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- order-snapshots policies (public read, auth upload)
DROP POLICY IF EXISTS "Snapshot public read" ON storage.objects;
CREATE POLICY "Snapshot public read" ON storage.objects FOR SELECT USING (bucket_id = 'order-snapshots');
DROP POLICY IF EXISTS "Snapshot auth upload" ON storage.objects;
CREATE POLICY "Snapshot auth upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'order-snapshots' AND auth.uid() IS NOT NULL);