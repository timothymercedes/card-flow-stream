
ALTER TABLE public.live_streams
  ADD COLUMN IF NOT EXISTS video_filter text NOT NULL DEFAULT 'none';

CREATE TABLE IF NOT EXISTS public.stream_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id uuid NOT NULL REFERENCES public.live_streams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stream_reactions_stream ON public.stream_reactions(stream_id, created_at DESC);

ALTER TABLE public.stream_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read recent reactions" ON public.stream_reactions;
CREATE POLICY "Anyone can read recent reactions" ON public.stream_reactions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Auth users can react" ON public.stream_reactions;
CREATE POLICY "Auth users can react" ON public.stream_reactions
  FOR INSERT WITH CHECK (auth.uid() = user_id AND length(emoji) BETWEEN 1 AND 12 AND length(username) BETWEEN 1 AND 40);

ALTER PUBLICATION supabase_realtime ADD TABLE public.stream_reactions;
