ALTER TABLE public.vault_cards
  ADD COLUMN IF NOT EXISTS price_tier text CHECK (price_tier IN ('verified','estimated','unavailable')),
  ADD COLUMN IF NOT EXISTS price_range_low numeric,
  ADD COLUMN IF NOT EXISTS price_range_high numeric;
CREATE INDEX IF NOT EXISTS idx_vault_cards_price_tier ON public.vault_cards(price_tier) WHERE price_tier IS NOT NULL;