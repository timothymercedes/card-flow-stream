ALTER TABLE public.vault_cards
  ADD COLUMN IF NOT EXISTS card_identity_id text,
  ADD COLUMN IF NOT EXISTS image_source text,
  ADD COLUMN IF NOT EXISTS match_score integer,
  ADD COLUMN IF NOT EXISTS confirmed_by text CHECK (confirmed_by IN ('auto','manual'));
CREATE INDEX IF NOT EXISTS idx_vault_cards_card_identity_id ON public.vault_cards(card_identity_id) WHERE card_identity_id IS NOT NULL;