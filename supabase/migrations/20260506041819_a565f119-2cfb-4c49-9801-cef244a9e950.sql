ALTER TABLE public.live_streams
  ADD COLUMN IF NOT EXISTS stream_type text NOT NULL DEFAULT 'auction',
  ADD COLUMN IF NOT EXISTS tcg_tags text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_live_streams_stream_type ON public.live_streams(stream_type);
CREATE INDEX IF NOT EXISTS idx_live_streams_tcg_tags ON public.live_streams USING GIN(tcg_tags);