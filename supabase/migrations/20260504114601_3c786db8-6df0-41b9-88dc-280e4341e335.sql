-- Quantity and voice trigger persistence for live streams
ALTER TABLE public.live_streams
  ADD COLUMN IF NOT EXISTS quick_start_quantity integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS quick_start_remaining integer;

-- Allow seller to update break_characters jsonb at any time (already allowed by existing
-- "Owner updates stream" policy on UPDATE) — no policy change needed.