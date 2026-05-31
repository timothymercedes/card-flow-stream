-- 1) Fix missing GRANTs (root cause of empty card_identities: service role could not write)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.card_identities TO service_role;
GRANT ALL ON public.card_identities TO service_role;
GRANT SELECT ON public.card_identities TO authenticated, anon;

GRANT ALL ON public.card_images TO service_role;
GRANT SELECT ON public.card_images TO authenticated, anon;

GRANT ALL ON public.price_observations TO service_role;
GRANT SELECT ON public.price_observations TO authenticated, anon;

GRANT ALL ON public.card_price_history TO service_role;
GRANT SELECT ON public.card_price_history TO authenticated;

GRANT ALL ON public.sold_comps TO service_role;
GRANT SELECT ON public.sold_comps TO authenticated, anon;

-- 2) Master identity: extra source-of-truth columns
ALTER TABLE public.card_identities
  ADD COLUMN IF NOT EXISTS provider_keys text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS rarity text,
  ADD COLUMN IF NOT EXISTS owner_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confidence_score numeric;

CREATE INDEX IF NOT EXISTS idx_card_identities_provider_keys
  ON public.card_identities USING GIN (provider_keys);

-- 3) Link vault cards to the master identity (additive; provider key stays in card_identity_id)
ALTER TABLE public.vault_cards
  ADD COLUMN IF NOT EXISTS master_identity_id uuid REFERENCES public.card_identities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vault_cards_master_identity
  ON public.vault_cards(master_identity_id);