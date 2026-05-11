-- 1) Strengthen notifications validation: enforce internal-only links + type allowlist.
CREATE OR REPLACE FUNCTION public.notifications_validate_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  recent_count int;
  allowed_types text[] := ARRAY[
    'won','sale','order','payment','payment_failed','payment_pending',
    'follow','like','comment','mention','reply','dm','message',
    'collab_invite','collab_join','collab_request','collab_accepted',
    'giveaway','giveaway_win','tip','shoutout','ko_request','ko_accepted',
    'verification','seller_agreement_reaccept','dispute','dispute_update',
    'shipping','shipped','delivered','listing','listing_sold','offer',
    'system','announcement','warning','support'
  ];
BEGIN
  -- Force sender_id to authenticated user
  NEW.sender_id := auth.uid();

  IF NEW.body IS NULL OR length(NEW.body) = 0 OR length(NEW.body) > 500 THEN
    RAISE EXCEPTION 'Notification body must be 1..500 chars';
  END IF;
  IF NEW.type IS NULL OR length(NEW.type) > 32 THEN
    RAISE EXCEPTION 'Invalid notification type';
  END IF;
  IF NOT (NEW.type = ANY(allowed_types)) THEN
    RAISE EXCEPTION 'Notification type % is not allowed', NEW.type;
  END IF;
  IF NEW.link IS NOT NULL THEN
    IF length(NEW.link) > 200 THEN
      RAISE EXCEPTION 'Notification link too long';
    END IF;
    -- Block phishing: only allow internal links starting with '/'.
    IF left(NEW.link, 1) <> '/' THEN
      RAISE EXCEPTION 'Notification link must be an internal path starting with /';
    END IF;
  END IF;

  IF NEW.user_id = auth.uid() THEN
    RETURN NEW;
  END IF;

  -- Rate-limit cross-user inserts: 60/hour per sender
  SELECT COUNT(*) INTO recent_count
  FROM public.notifications
  WHERE sender_id = auth.uid()
    AND user_id <> auth.uid()
    AND created_at > now() - interval '1 hour';
  IF recent_count >= 60 THEN
    RAISE EXCEPTION 'Notification rate limit exceeded';
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) id-documents bucket: allow staff (admin/owner/moderator) to read uploaded
-- ID documents for verification review, and let owners delete their own files.
DROP POLICY IF EXISTS "Staff can read id-documents" ON storage.objects;
CREATE POLICY "Staff can read id-documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'id-documents'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'moderator'::app_role)
  )
);

DROP POLICY IF EXISTS "ID owner delete" ON storage.objects;
CREATE POLICY "ID owner delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'id-documents'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- 3) Fix mutable search_path on compute_card_key.
DO $$
DECLARE _sig text;
BEGIN
  SELECT pg_get_function_identity_arguments(p.oid)
    INTO _sig
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='compute_card_key' LIMIT 1;
  IF _sig IS NOT NULL THEN
    EXECUTE format('ALTER FUNCTION public.compute_card_key(%s) SET search_path TO ''public''', _sig);
  END IF;
END$$;