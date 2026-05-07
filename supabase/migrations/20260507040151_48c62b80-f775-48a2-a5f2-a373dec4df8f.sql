-- Tighten storage upload policies to enforce folder = auth.uid()
DROP POLICY IF EXISTS "Auth users upload story images" ON storage.objects;
CREATE POLICY "Users upload to own story folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'stories'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Snapshot auth upload" ON storage.objects;
CREATE POLICY "Users upload to own snapshot folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'order-snapshots'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
