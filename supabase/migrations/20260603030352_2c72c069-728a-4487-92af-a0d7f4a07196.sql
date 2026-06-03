-- Priority 5: Showcase 9 — let users pin up to 9 favorite vault cards to their profile.
ALTER TABLE public.vault_cards ADD COLUMN IF NOT EXISTS showcase_order SMALLINT;

-- Only valid positions 1..9 (NULL = not showcased). Enforced via trigger (CHECK kept simple/immutable here is fine since it's a constant range).
ALTER TABLE public.vault_cards DROP CONSTRAINT IF EXISTS vault_cards_showcase_order_range;
ALTER TABLE public.vault_cards ADD CONSTRAINT vault_cards_showcase_order_range
  CHECK (showcase_order IS NULL OR (showcase_order BETWEEN 1 AND 9));

CREATE INDEX IF NOT EXISTS idx_vault_cards_showcase
  ON public.vault_cards(user_id, showcase_order) WHERE showcase_order IS NOT NULL;
