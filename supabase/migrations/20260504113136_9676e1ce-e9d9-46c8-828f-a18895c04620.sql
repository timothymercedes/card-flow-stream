-- Per-slot character/label support for Mystery Break
ALTER TABLE public.break_slots
  ADD COLUMN IF NOT EXISTS character_label text;

-- Stream-level: character roster (array of strings, one per slot 1..N)
-- Sudden-death mode flag, voice-trigger phrase + flag
ALTER TABLE public.live_streams
  ADD COLUMN IF NOT EXISTS break_characters jsonb,
  ADD COLUMN IF NOT EXISTS sudden_death_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS voice_trigger_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS voice_trigger_phrase text;

-- Dedicated break-reveal wheel state (separate from the prize SpinWheel)
ALTER TABLE public.live_streams
  ADD COLUMN IF NOT EXISTS break_wheel_spinning boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS break_wheel_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS break_wheel_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS break_wheel_target_slot integer,
  ADD COLUMN IF NOT EXISTS break_wheel_last_winner_username text,
  ADD COLUMN IF NOT EXISTS break_wheel_last_winner_label text;