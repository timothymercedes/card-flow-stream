ALTER TABLE public.live_streams ADD COLUMN IF NOT EXISTS category text;
CREATE INDEX IF NOT EXISTS idx_live_streams_category ON public.live_streams(category);