ALTER TABLE public.giveaways
  ADD COLUMN IF NOT EXISTS duration_sec integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1;