
-- Per-follow notification preferences (beyond the existing notify_on_live)
ALTER TABLE public.follows
  ADD COLUMN IF NOT EXISTS notify_new_listing boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_auction_start boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_promotions boolean NOT NULL DEFAULT true;

-- Storefront branding fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS banner_url text,
  ADD COLUMN IF NOT EXISTS accent_color text,
  ADD COLUMN IF NOT EXISTS social_links jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS featured_listing_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

-- Light validation for accent_color (must be #RGB or #RRGGBB if present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_accent_color_format'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_accent_color_format
      CHECK (accent_color IS NULL OR accent_color ~* '^#([0-9a-f]{3}|[0-9a-f]{6})$');
  END IF;
END$$;
