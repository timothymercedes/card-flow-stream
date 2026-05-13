ALTER TABLE public.vault_cards
  ADD COLUMN IF NOT EXISTS is_graded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS grader text,
  ADD COLUMN IF NOT EXISTS grade text,
  ADD COLUMN IF NOT EXISTS grading_cert text,
  ADD COLUMN IF NOT EXISTS graded_price numeric;

CREATE INDEX IF NOT EXISTS idx_vault_cards_is_graded ON public.vault_cards(is_graded) WHERE is_graded = true;