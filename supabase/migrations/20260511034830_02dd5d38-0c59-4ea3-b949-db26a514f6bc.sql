ALTER TABLE public.vault_cards
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'available',
  ADD COLUMN IF NOT EXISTS sold_at timestamptz,
  ADD COLUMN IF NOT EXISTS sold_stream_id uuid;

CREATE INDEX IF NOT EXISTS idx_vault_cards_user_status ON public.vault_cards(user_id, status);