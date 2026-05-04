ALTER TABLE public.vault_cards
  ADD COLUMN IF NOT EXISTS tcg_year text,
  ADD COLUMN IF NOT EXISTS back_image_url text,
  ADD COLUMN IF NOT EXISTS condition_prices jsonb;

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS back_image_url text,
  ADD COLUMN IF NOT EXISTS tcg_year text;