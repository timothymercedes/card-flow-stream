DROP POLICY IF EXISTS "Bazaar media readable when published or by staff" ON storage.objects;
CREATE POLICY "Bazaar media readable by store staff" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'bazaar-media'
  AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  AND (
    public.bazaar_store_role_in(((storage.foldername(name))[1])::uuid, auth.uid(), ARRAY['owner','admin','catalog','fulfillment','viewer'])
    OR public.is_bazaar_admin(auth.uid())
  )
);