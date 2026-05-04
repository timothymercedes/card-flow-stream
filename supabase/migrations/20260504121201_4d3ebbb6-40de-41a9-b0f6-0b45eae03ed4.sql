ALTER TABLE public.live_streams 
  ADD COLUMN IF NOT EXISTS chat_slow_mode_sec integer NOT NULL DEFAULT 0;