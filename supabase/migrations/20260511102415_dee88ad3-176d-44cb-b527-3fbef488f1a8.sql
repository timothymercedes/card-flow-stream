
-- Tighten chat_messages: prevent username spoofing & enforce user_id matches caller in RLS.
DROP POLICY IF EXISTS "Authed users post chat" ON public.chat_messages;
CREATE POLICY "Authed users post chat" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
-- Trigger handles user_id assignment; also force username from profiles for non-staff.

CREATE OR REPLACE FUNCTION public.chat_messages_validate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _is_staff boolean;
  _recent int;
  _profile_username text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  _is_staff := public.is_stream_staff(NEW.stream_id, _uid)
            OR public.has_role(_uid,'admin') OR public.has_role(_uid,'owner') OR public.has_role(_uid,'moderator');

  IF NOT _is_staff THEN
    NEW.user_id := _uid;
    NEW.is_system := false;
    NEW.is_announcement := false;
    NEW.is_hype := false;
    -- Force username from caller's profile to prevent impersonation
    SELECT username INTO _profile_username FROM public.profiles WHERE id = _uid;
    IF _profile_username IS NULL THEN
      RAISE EXCEPTION 'Profile required to chat';
    END IF;
    NEW.username := _profile_username;
  ELSE
    IF NEW.user_id IS NOT NULL AND NEW.user_id <> _uid THEN
      RAISE EXCEPTION 'Cannot post as another user';
    END IF;
    -- For staff posting as themselves (non-system), enforce their own username
    IF NEW.user_id = _uid AND NOT NEW.is_system THEN
      SELECT username INTO _profile_username FROM public.profiles WHERE id = _uid;
      IF _profile_username IS NOT NULL THEN
        NEW.username := _profile_username;
      END IF;
    END IF;
  END IF;

  IF NEW.content IS NULL OR length(btrim(NEW.content)) = 0 OR length(NEW.content) > 500 THEN
    RAISE EXCEPTION 'Chat message must be 1..500 chars';
  END IF;

  SELECT count(*) INTO _recent FROM public.chat_messages
   WHERE user_id = _uid AND stream_id = NEW.stream_id AND created_at > now() - interval '1 minute';
  IF _recent >= 30 THEN
    RAISE EXCEPTION 'Slow down — chat rate limit reached';
  END IF;

  RETURN NEW;
END; $function$;
