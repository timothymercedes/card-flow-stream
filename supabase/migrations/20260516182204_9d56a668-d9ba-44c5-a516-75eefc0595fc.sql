ALTER TABLE public.live_stage_layouts
  ADD COLUMN IF NOT EXISTS source_key text,
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'cohost' CHECK (source_type IN ('host','cohost','camera','screen','phone','external'));

UPDATE public.live_stage_layouts
SET source_key = tile_user_id::text
WHERE source_key IS NULL;

ALTER TABLE public.live_stage_layouts
  ALTER COLUMN source_key SET NOT NULL;

ALTER TABLE public.live_stage_layouts
  DROP CONSTRAINT IF EXISTS live_stage_layouts_pkey;

ALTER TABLE public.live_stage_layouts
  ADD CONSTRAINT live_stage_layouts_pkey PRIMARY KEY (stream_id, source_key);

CREATE INDEX IF NOT EXISTS idx_live_stage_layouts_stream_z
  ON public.live_stage_layouts (stream_id, z, updated_at);

ALTER TABLE public.live_stage_layouts REPLICA IDENTITY FULL;