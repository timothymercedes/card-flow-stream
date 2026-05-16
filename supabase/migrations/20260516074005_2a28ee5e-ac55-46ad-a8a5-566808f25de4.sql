CREATE OR REPLACE FUNCTION public.collab_invite_apply_accept()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE av text;
BEGIN
  IF NEW.status = 'accepted' AND COALESCE(OLD.status,'') <> 'accepted' THEN
    INSERT INTO public.stream_moderators (stream_id, host_id, mod_user_id, mod_username)
    VALUES (NEW.stream_id, NEW.host_id, NEW.invitee_id, NEW.invitee_username)
    ON CONFLICT DO NOTHING;
    SELECT avatar_url INTO av FROM public.profiles WHERE id = NEW.invitee_id;
    INSERT INTO public.stream_collab_participants (stream_id, user_id, username, avatar_url)
    VALUES (NEW.stream_id, NEW.invitee_id, NEW.invitee_username, av)
    ON CONFLICT DO NOTHING;
    NEW.responded_at := now();
  ELSIF NEW.status = 'declined' AND COALESCE(OLD.status,'') <> 'declined' THEN
    NEW.responded_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.collab_join_request_apply_accept()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'accepted' AND COALESCE(OLD.status,'') <> 'accepted' THEN
    INSERT INTO public.stream_moderators (stream_id, host_id, mod_user_id, mod_username)
    VALUES (NEW.stream_id, NEW.host_id, NEW.requester_id, NEW.requester_username)
    ON CONFLICT DO NOTHING;
    INSERT INTO public.stream_collab_participants (stream_id, user_id, username, avatar_url)
    VALUES (NEW.stream_id, NEW.requester_id, NEW.requester_username, NEW.requester_avatar_url)
    ON CONFLICT DO NOTHING;
    NEW.responded_at := now();
  ELSIF NEW.status = 'declined' AND COALESCE(OLD.status,'') <> 'declined' THEN
    NEW.responded_at := now();
  END IF;
  RETURN NEW;
END;
$$;

-- Also fix the older function from the earlier migration
CREATE OR REPLACE FUNCTION public.collab_invite_promote_to_mod()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'accepted' AND COALESCE(OLD.status,'') <> 'accepted' THEN
    INSERT INTO public.stream_moderators (stream_id, host_id, mod_user_id, mod_username)
    VALUES (NEW.stream_id, NEW.host_id, NEW.invitee_id, NEW.invitee_username)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;