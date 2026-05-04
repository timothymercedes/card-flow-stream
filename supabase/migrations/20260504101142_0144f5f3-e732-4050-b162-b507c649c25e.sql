
ALTER TABLE public.live_streams
  ADD COLUMN IF NOT EXISTS round_number integer NOT NULL DEFAULT 0;
