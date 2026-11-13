DROP POLICY "Admins read evidence files" ON storage.objects;
CREATE POLICY "Admins read evidence files" ON storage.objects FOR SELECT TO authenticated
USING ((bucket_id = 'moderation-evidence') AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'moderator')));