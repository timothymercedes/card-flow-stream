
-- 1) Unique shop name on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS shop_name text;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_shop_name_key ON public.profiles (lower(shop_name)) WHERE shop_name IS NOT NULL;

-- Validate shop_name format on write
CREATE OR REPLACE FUNCTION public.validate_shop_name()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.shop_name IS NOT NULL THEN
    IF length(NEW.shop_name) < 3 OR length(NEW.shop_name) > 30 THEN
      RAISE EXCEPTION 'Shop name must be 3-30 characters';
    END IF;
    IF NEW.shop_name !~ '^[A-Za-z0-9_ -]+$' THEN
      RAISE EXCEPTION 'Shop name may only contain letters, numbers, spaces, _ and -';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS profiles_validate_shop_name ON public.profiles;
CREATE TRIGGER profiles_validate_shop_name BEFORE INSERT OR UPDATE OF shop_name ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.validate_shop_name();

-- 2) Stream collab invites (co-host lite -> stream_moderators on accept)
CREATE TABLE IF NOT EXISTS public.stream_collab_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id uuid NOT NULL,
  host_id uuid NOT NULL,
  host_username text NOT NULL,
  invitee_id uuid NOT NULL,
  invitee_username text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE (stream_id, invitee_id)
);
ALTER TABLE public.stream_collab_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Invite parties view" ON public.stream_collab_invites
  FOR SELECT USING (auth.uid() = host_id OR auth.uid() = invitee_id);

CREATE POLICY "Host creates invite" ON public.stream_collab_invites
  FOR INSERT WITH CHECK (
    auth.uid() = host_id
    AND EXISTS (SELECT 1 FROM public.live_streams ls WHERE ls.id = stream_id AND ls.seller_id = auth.uid())
    AND invitee_id <> host_id
  );

CREATE POLICY "Invitee or host updates invite" ON public.stream_collab_invites
  FOR UPDATE USING (auth.uid() = invitee_id OR auth.uid() = host_id);

-- When invitee accepts, automatically add them as a stream moderator (co-host lite)
CREATE OR REPLACE FUNCTION public.collab_invite_apply_accept()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'accepted' AND COALESCE(OLD.status,'') <> 'accepted' THEN
    INSERT INTO public.stream_moderators (stream_id, mod_user_id, mod_username, added_by)
    VALUES (NEW.stream_id, NEW.invitee_id, NEW.invitee_username, NEW.host_id)
    ON CONFLICT DO NOTHING;
    NEW.responded_at := now();
  ELSIF NEW.status = 'declined' AND COALESCE(OLD.status,'') <> 'declined' THEN
    NEW.responded_at := now();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS collab_invite_apply_accept_trg ON public.stream_collab_invites;
CREATE TRIGGER collab_invite_apply_accept_trg BEFORE UPDATE ON public.stream_collab_invites
FOR EACH ROW EXECUTE FUNCTION public.collab_invite_apply_accept();

ALTER PUBLICATION supabase_realtime ADD TABLE public.stream_collab_invites;
