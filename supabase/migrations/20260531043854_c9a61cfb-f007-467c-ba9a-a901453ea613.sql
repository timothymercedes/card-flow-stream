ALTER TABLE public.vault_cards
  ADD COLUMN IF NOT EXISTS original_image_url text,
  ADD COLUMN IF NOT EXISTS ai_image_url text,
  ADD COLUMN IF NOT EXISTS image_gallery jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS confidence_score numeric,
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_reason text,
  ADD COLUMN IF NOT EXISTS identification_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_rescan_at timestamptz,
  ADD COLUMN IF NOT EXISTS wrong_match_reported_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_vault_cards_needs_review ON public.vault_cards(user_id, needs_review) WHERE needs_review = true;
CREATE INDEX IF NOT EXISTS idx_vault_cards_last_rescan_at ON public.vault_cards(last_rescan_at);
CREATE INDEX IF NOT EXISTS idx_vault_cards_confidence_score ON public.vault_cards(confidence_score);