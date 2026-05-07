-- chat_messages: validate sender + flags + length + rate
CREATE OR REPLACE FUNCTION public.chat_messages_validate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_staff boolean;
  _recent int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  -- Force user_id to authed user (unless staff posting system msg)
  _is_staff := public.is_stream_staff(NEW.stream_id, _uid)
            OR public.has_role(_uid,'admin') OR public.has_role(_uid,'owner') OR public.has_role(_uid,'moderator');

  IF NOT _is_staff THEN
    NEW.user_id := _uid;
    NEW.is_system := false;
    NEW.is_announcement := false;
    NEW.is_hype := false;
  ELSE
    -- staff may post as themselves or as system; if user_id provided, must be self
    IF NEW.user_id IS NOT NULL AND NEW.user_id <> _uid THEN
      RAISE EXCEPTION 'Cannot post as another user';
    END IF;
  END IF;

  IF NEW.content IS NULL OR length(btrim(NEW.content)) = 0 OR length(NEW.content) > 500 THEN
    RAISE EXCEPTION 'Chat message must be 1..500 chars';
  END IF;

  -- Rate limit: 30/min per user per stream
  SELECT count(*) INTO _recent FROM public.chat_messages
   WHERE user_id = _uid AND stream_id = NEW.stream_id AND created_at > now() - interval '1 minute';
  IF _recent >= 30 THEN
    RAISE EXCEPTION 'Slow down — chat rate limit reached';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_chat_messages_validate ON public.chat_messages;
CREATE TRIGGER trg_chat_messages_validate
BEFORE INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.chat_messages_validate();

REVOKE ALL ON FUNCTION public.chat_messages_validate() FROM PUBLIC, anon, authenticated;

-- direct_messages: validate sender + length + rate
CREATE OR REPLACE FUNCTION public.direct_messages_validate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _recent int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NEW.sender_id <> _uid THEN RAISE EXCEPTION 'Sender mismatch'; END IF;
  IF NEW.recipient_id = _uid THEN RAISE EXCEPTION 'Cannot message yourself'; END IF;
  IF NEW.content IS NULL OR length(btrim(NEW.content)) = 0 OR length(NEW.content) > 2000 THEN
    RAISE EXCEPTION 'Message must be 1..2000 chars';
  END IF;

  SELECT count(*) INTO _recent FROM public.direct_messages
    WHERE sender_id = _uid AND created_at > now() - interval '1 minute';
  IF _recent >= 60 THEN
    RAISE EXCEPTION 'Slow down — DM rate limit reached';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_direct_messages_validate ON public.direct_messages;
CREATE TRIGGER trg_direct_messages_validate
BEFORE INSERT ON public.direct_messages
FOR EACH ROW EXECUTE FUNCTION public.direct_messages_validate();

REVOKE ALL ON FUNCTION public.direct_messages_validate() FROM PUBLIC, anon, authenticated;