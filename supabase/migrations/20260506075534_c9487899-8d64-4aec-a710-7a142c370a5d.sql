-- Enable realtime on support tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_ticket_messages;

-- Notify ticket owner when a staff member replies
CREATE OR REPLACE FUNCTION public.support_message_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid;
  _subject text;
BEGIN
  IF NEW.is_staff = true THEN
    SELECT user_id, subject INTO _owner, _subject
      FROM public.support_tickets WHERE id = NEW.ticket_id;
    IF _owner IS NOT NULL AND _owner <> NEW.sender_id THEN
      INSERT INTO public.notifications (user_id, sender_id, type, body, link)
      VALUES (
        _owner, NEW.sender_id, 'support_reply',
        'Support replied: ' || COALESCE(LEFT(_subject, 80), 'your ticket'),
        '/?ticket=' || NEW.ticket_id::text
      );
    END IF;
  END IF;
  -- Bump ticket updated_at
  UPDATE public.support_tickets SET updated_at = now() WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_message_notify_trg ON public.support_ticket_messages;
CREATE TRIGGER support_message_notify_trg
AFTER INSERT ON public.support_ticket_messages
FOR EACH ROW EXECUTE FUNCTION public.support_message_notify();