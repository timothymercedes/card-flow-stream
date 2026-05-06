
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE public.stream_cohost_tracks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stream_id UUID NOT NULL REFERENCES public.live_streams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  username TEXT NOT NULL,
  avatar_url TEXT,
  session_id TEXT NOT NULL,
  audio_track_name TEXT,
  video_track_name TEXT,
  is_audio_enabled BOOLEAN NOT NULL DEFAULT true,
  is_video_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (stream_id, user_id)
);

CREATE INDEX idx_cohost_tracks_stream ON public.stream_cohost_tracks(stream_id);

ALTER TABLE public.stream_cohost_tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read cohost tracks"
  ON public.stream_cohost_tracks FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert their own cohost track"
  ON public.stream_cohost_tracks FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND (
      EXISTS (SELECT 1 FROM public.live_streams ls WHERE ls.id = stream_id AND ls.seller_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.stream_collab_participants p WHERE p.stream_id = stream_cohost_tracks.stream_id AND p.user_id = auth.uid())
    )
  );

CREATE POLICY "Users can update their own cohost track"
  ON public.stream_cohost_tracks FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users or host can delete cohost track"
  ON public.stream_cohost_tracks FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.live_streams ls WHERE ls.id = stream_id AND ls.seller_id = auth.uid())
  );

CREATE TRIGGER trg_cohost_tracks_updated_at
  BEFORE UPDATE ON public.stream_cohost_tracks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.stream_cohost_tracks;
