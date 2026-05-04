
-- Stream moderators
CREATE TABLE public.stream_moderators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id uuid NOT NULL,
  host_id uuid NOT NULL,
  mod_user_id uuid NOT NULL,
  mod_username text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stream_id, mod_user_id)
);
ALTER TABLE public.stream_moderators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mods viewable by all" ON public.stream_moderators
  FOR SELECT USING (true);

CREATE POLICY "Host adds mods" ON public.stream_moderators
  FOR INSERT WITH CHECK (
    auth.uid() = host_id
    AND EXISTS (SELECT 1 FROM public.live_streams ls WHERE ls.id = stream_id AND ls.seller_id = auth.uid())
  );

CREATE POLICY "Host removes mods" ON public.stream_moderators
  FOR DELETE USING (
    auth.uid() = host_id
    AND EXISTS (SELECT 1 FROM public.live_streams ls WHERE ls.id = stream_id AND ls.seller_id = auth.uid())
  );

-- Helper: is this user the host or a mod of the stream?
CREATE OR REPLACE FUNCTION public.is_stream_staff(_stream_id uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.live_streams ls WHERE ls.id = _stream_id AND ls.seller_id = _user
  ) OR EXISTS (
    SELECT 1 FROM public.stream_moderators sm WHERE sm.stream_id = _stream_id AND sm.mod_user_id = _user
  );
$$;

-- Private back-channel messages between host & mods
CREATE TABLE public.stream_mod_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id uuid NOT NULL,
  user_id uuid NOT NULL,
  username text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stream_mod_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view mod chat" ON public.stream_mod_messages
  FOR SELECT USING (public.is_stream_staff(stream_id, auth.uid()));

CREATE POLICY "Staff send mod chat" ON public.stream_mod_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id AND public.is_stream_staff(stream_id, auth.uid()));

-- Add announcement + hype flags to chat_messages
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS is_announcement boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_hype boolean NOT NULL DEFAULT false;

-- Per-seller shipping cap
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS shipping_cap numeric;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.stream_mod_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stream_moderators;
