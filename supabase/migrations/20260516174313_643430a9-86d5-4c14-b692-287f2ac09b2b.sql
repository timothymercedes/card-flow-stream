
-- 1) live_stage_layouts: host-authoritative camera tile positions broadcast to viewers
CREATE TABLE IF NOT EXISTS public.live_stage_layouts (
  stream_id uuid NOT NULL REFERENCES public.live_streams(id) ON DELETE CASCADE,
  tile_user_id uuid NOT NULL,
  x numeric NOT NULL DEFAULT 0.7,
  y numeric NOT NULL DEFAULT 0.05,
  w numeric NOT NULL DEFAULT 0.25,
  h numeric NOT NULL DEFAULT 0.22,
  z integer NOT NULL DEFAULT 1,
  object_fit text NOT NULL DEFAULT 'cover' CHECK (object_fit IN ('cover','contain')),
  zoom numeric NOT NULL DEFAULT 1.0,
  hidden boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  PRIMARY KEY (stream_id, tile_user_id)
);

ALTER TABLE public.live_stage_layouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stage layouts viewable by all"
  ON public.live_stage_layouts FOR SELECT USING (true);

CREATE POLICY "Stream host writes stage layout"
  ON public.live_stage_layouts FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.live_streams s
            WHERE s.id = live_stage_layouts.stream_id AND s.seller_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.live_streams s
            WHERE s.id = live_stage_layouts.stream_id AND s.seller_id = auth.uid())
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.live_stage_layouts;
ALTER TABLE public.live_stage_layouts REPLICA IDENTITY FULL;

-- 2) chat_messages.audience: public | mods_only | host_mods
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'public'
    CHECK (audience IN ('public','mods_only','host_mods'));

CREATE INDEX IF NOT EXISTS idx_chat_messages_stream_audience
  ON public.chat_messages (stream_id, audience, created_at DESC);

-- Helper: is the caller a moderator (global admin/moderator role) or the stream host?
CREATE OR REPLACE FUNCTION public.can_see_mod_chat(_stream_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.live_streams s
            WHERE s.id = _stream_id AND s.seller_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_roles r
               WHERE r.user_id = auth.uid()
                 AND r.role IN ('admin','moderator','owner'));
$$;

-- Replace SELECT policy: viewers only see public; host+mods see all
DROP POLICY IF EXISTS "Chat viewable by all" ON public.chat_messages;
CREATE POLICY "Chat audience-scoped read"
  ON public.chat_messages FOR SELECT
  USING (
    audience = 'public'
    OR public.can_see_mod_chat(stream_id)
  );

-- Only host or mods may post non-public audience messages
DROP POLICY IF EXISTS "Authed users post chat" ON public.chat_messages;
CREATE POLICY "Authed users post chat"
  ON public.chat_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      audience = 'public'
      OR public.can_see_mod_chat(stream_id)
    )
  );
