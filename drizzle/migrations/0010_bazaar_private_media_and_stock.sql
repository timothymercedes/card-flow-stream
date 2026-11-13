CREATE POLICY "Bazaar media readable when published or by staff" ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'bazaar-media' AND (
  EXISTS (SELECT 1 FROM public.bazaar_products p WHERE p.status = 'published' AND public.bazaar_store_is_active(p.store_id) AND storage.objects.name = ANY(p.images))
  OR EXISTS (SELECT 1 FROM public.bazaar_stores s WHERE s.status = 'active' AND (s.logo_url = storage.objects.name OR s.cover_url = storage.objects.name))
  OR (auth.uid() IS NOT NULL AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' AND (public.bazaar_store_role_in(((storage.foldername(name))[1])::uuid, auth.uid(), ARRAY['owner','admin','catalog','fulfillment','viewer']) OR public.is_bazaar_admin(auth.uid())))
));
CREATE POLICY "Bazaar staff upload own media" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'bazaar-media' AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' AND (storage.foldername(name))[2] = auth.uid()::text
  AND public.bazaar_store_role_in(((storage.foldername(name))[1])::uuid, auth.uid(), ARRAY['owner','admin','catalog']));
CREATE POLICY "Bazaar uploader deletes own media" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'bazaar-media' AND (storage.foldername(name))[2] = auth.uid()::text);

DROP POLICY "Public sees published variants" ON public.bazaar_product_variants;
CREATE POLICY "Public sees published variants" ON public.bazaar_product_variants FOR SELECT TO anon, authenticated
USING (is_active AND quantity > 0 AND EXISTS (SELECT 1 FROM public.bazaar_products p WHERE p.id = bazaar_product_variants.product_id AND p.status = 'published' AND public.bazaar_store_is_active(p.store_id)));