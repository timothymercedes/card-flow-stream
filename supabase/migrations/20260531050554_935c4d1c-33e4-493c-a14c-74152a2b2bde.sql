ALTER TABLE public.vault_cards
  ADD COLUMN IF NOT EXISTS match_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS incorrect_price_reported boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS incorrect_price_reported_at timestamptz;