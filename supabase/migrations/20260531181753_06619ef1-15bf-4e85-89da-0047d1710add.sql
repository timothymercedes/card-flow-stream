ALTER TABLE public.card_identities
  ADD COLUMN IF NOT EXISTS market_value_cents integer,
  ADD COLUMN IF NOT EXISTS price_currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS price_source text,
  ADD COLUMN IF NOT EXISTS last_price_sync timestamptz,
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS ai_reference_image_url text;

CREATE INDEX IF NOT EXISTS idx_card_identities_last_price_sync
  ON public.card_identities (last_price_sync);

-- Allow service_role full access (cron + server fns write prices/identities)
GRANT ALL ON public.card_identities TO service_role;
GRANT SELECT ON public.card_identities TO anon, authenticated;