DROP POLICY IF EXISTS "Auth users upload evidence" ON storage.objects;
CREATE POLICY "Auth users upload evidence" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'moderation-evidence' AND (storage.foldername(name))[1] = auth.uid()::text);