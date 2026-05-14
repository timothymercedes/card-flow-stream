
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS ships_internationally boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blocked_countries text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.live_streams
  ADD COLUMN IF NOT EXISTS ships_internationally boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blocked_countries text[] NOT NULL DEFAULT '{}'::text[];
