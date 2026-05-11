ALTER TABLE public.vault_cards
  ADD COLUMN IF NOT EXISTS market_price numeric,
  ADD COLUMN IF NOT EXISTS price_low numeric,
  ADD COLUMN IF NOT EXISTS price_high numeric,
  ADD COLUMN IF NOT EXISTS last_sold_price numeric,
  ADD COLUMN IF NOT EXISTS recent_sales_avg numeric,
  ADD COLUMN IF NOT EXISTS price_source text,
  ADD COLUMN IF NOT EXISTS price_source_url text,
  ADD COLUMN IF NOT EXISTS price_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS pricing_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS price_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_price numeric,
  ADD COLUMN IF NOT EXISTS custom_price_source text;

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS market_price numeric,
  ADD COLUMN IF NOT EXISTS price_low numeric,
  ADD COLUMN IF NOT EXISTS price_high numeric,
  ADD COLUMN IF NOT EXISTS last_sold_price numeric,
  ADD COLUMN IF NOT EXISTS recent_sales_avg numeric,
  ADD COLUMN IF NOT EXISTS price_source text,
  ADD COLUMN IF NOT EXISTS price_source_url text,
  ADD COLUMN IF NOT EXISTS price_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS pricing_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS price_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_price numeric,
  ADD COLUMN IF NOT EXISTS custom_price_source text;

CREATE INDEX IF NOT EXISTS idx_vault_cards_price_updated_at ON public.vault_cards(price_updated_at);
CREATE INDEX IF NOT EXISTS idx_listings_price_updated_at ON public.listings(price_updated_at);