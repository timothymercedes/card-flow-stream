
-- Participants table
CREATE TABLE IF NOT EXISTS public.stream_collab_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id uuid NOT NULL,
  user_id uuid NOT NULL,
  username text NOT NULL,
  avatar_url text,
  is_muted boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stream_id, user_id)
);

ALTER TABLE public.stream_collab_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants viewable by all"
  ON public.stream_collab_participants FOR SELECT USING (true);

CREATE POLICY "Host manages participants insert"
  ON public.stream_collab_participants FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.live_streams ls WHERE ls.id = stream_id AND ls.seller_id = auth.uid())
    OR auth.uid() = user_id
  );

CREATE POLICY "Host manages participants update"
  ON public.stream_collab_participants FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.live_streams ls WHERE ls.id = stream_id AND ls.seller_id = auth.uid())
  );

CREATE POLICY "Host or self removes participant"
  ON public.stream_collab_participants FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.live_streams ls WHERE ls.id = stream_id AND ls.seller_id = auth.uid())
    OR auth.uid() = user_id
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.stream_collab_participants;

-- Verified-only gate for invites
CREATE OR REPLACE FUNCTION public.collab_invite_verified_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.invitee_id AND p.live_verified = true) THEN
    RAISE EXCEPTION 'Only verified users can be invited to collab';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS collab_invite_verified_trg ON public.stream_collab_invites;
CREATE TRIGGER collab_invite_verified_trg
  BEFORE INSERT ON public.stream_collab_invites
  FOR EACH ROW EXECUTE FUNCTION public.collab_invite_verified_check();

-- Verified-only gate for join requests
CREATE OR REPLACE FUNCTION public.collab_join_verified_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.requester_id AND p.live_verified = true) THEN
    RAISE EXCEPTION 'Only verified users can request to collab';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS collab_join_verified_trg ON public.stream_collab_join_requests;
CREATE TRIGGER collab_join_verified_trg
  BEFORE INSERT ON public.stream_collab_join_requests
  FOR EACH ROW EXECUTE FUNCTION public.collab_join_verified_check();

-- Update accept triggers to also create a participant row
CREATE OR REPLACE FUNCTION public.collab_invite_apply_accept()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE av text;
BEGIN
  IF NEW.status = 'accepted' AND COALESCE(OLD.status,'') <> 'accepted' THEN
    INSERT INTO public.stream_moderators (stream_id, mod_user_id, mod_username, added_by)
    VALUES (NEW.stream_id, NEW.invitee_id, NEW.invitee_username, NEW.host_id)
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
    INSERT INTO public.stream_moderators (stream_id, mod_user_id, mod_username, added_by)
    VALUES (NEW.stream_id, NEW.requester_id, NEW.requester_username, NEW.host_id)
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
