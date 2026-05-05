
-- 1) live_streams: hide CF credentials at the column-privilege level
REVOKE SELECT (cf_stream_key, cf_rtmps_url, cf_live_input_id) ON public.live_streams FROM anon, authenticated;
-- Owners still get full row via "Owner reads full stream" policy + service role bypass

-- 2) notifications: tighten INSERT policy
DROP POLICY IF EXISTS "Auth users create notifications" ON public.notifications;
CREATE POLICY "Auth users create notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
-- (Trigger notifications_validate_insert already forces sender_id = auth.uid(),
--  caps body length, validates type, and rate-limits cross-user inserts to 60/hr.)

-- 3) spin_wheels: add WITH CHECK on viewer update (defense-in-depth alongside trigger)
DROP POLICY IF EXISTS "Viewer triggers allowed spin" ON public.spin_wheels;
CREATE POLICY "Viewer triggers allowed spin"
  ON public.spin_wheels FOR UPDATE TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND viewer_can_spin = true
    AND is_open = true
    AND is_spinning = false
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND viewer_can_spin = true
    AND is_open = true
  );

-- 4) legal_acceptances: add restrictive policies to forbid UPDATE/DELETE
CREATE POLICY "No updates to legal acceptances"
  ON public.legal_acceptances AS RESTRICTIVE FOR UPDATE TO public
  USING (false);
CREATE POLICY "No deletes of legal acceptances"
  ON public.legal_acceptances AS RESTRICTIVE FOR DELETE TO public
  USING (false);

-- 5) Storage policies for stories: respect story visibility
DROP POLICY IF EXISTS "Stories storage respects visibility" ON storage.objects;
CREATE POLICY "Stories storage respects visibility"
  ON storage.objects FOR SELECT TO public
  USING (
    bucket_id = 'stories' AND (
      EXISTS (
        SELECT 1 FROM public.stories s
        WHERE s.image_url LIKE '%' || storage.objects.name || '%'
          AND s.expires_at > now()
          AND public.can_view_story(s.user_id, s.visibility, auth.uid())
      )
      OR (storage.foldername(name))[1] = COALESCE(auth.uid()::text, '')
    )
  );

-- 6) Storage policies for vault-images: respect vault visibility
DROP POLICY IF EXISTS "Vault images respect vault visibility" ON storage.objects;
CREATE POLICY "Vault images respect vault visibility"
  ON storage.objects FOR SELECT TO public
  USING (
    bucket_id = 'vault-images' AND (
      (storage.foldername(name))[1] = COALESCE(auth.uid()::text, '')
      OR public.can_view_vault_owner(
           ((storage.foldername(name))[1])::uuid,
           auth.uid()
         )
    )
  );

-- Make these buckets private so RLS on storage.objects is enforced
UPDATE storage.buckets SET public = false WHERE id IN ('stories','vault-images');
