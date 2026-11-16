ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS store_logo_url text,
  ADD COLUMN IF NOT EXISTS profile_cover_position smallint NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS profile_layout text NOT NULL DEFAULT 'classic';
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_cover_position_range CHECK (profile_cover_position BETWEEN 0 AND 100),
  ADD CONSTRAINT profiles_layout_values CHECK (profile_layout IN ('classic','centered','compact'));