
ALTER TABLE public.pokemon_cards
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'tcg_api',
  ADD COLUMN IF NOT EXISTS source_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz DEFAULT now();

ALTER TABLE public.card_scans
  ADD COLUMN IF NOT EXISTS match_candidates jsonb,
  ADD COLUMN IF NOT EXISTS chosen_source text,
  ADD COLUMN IF NOT EXISTS price_sources jsonb;

ALTER TABLE public.card_price_history
  ADD COLUMN IF NOT EXISTS mid numeric,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_cph_source_time ON public.card_price_history (source, captured_at DESC);

CREATE TABLE IF NOT EXISTS public.card_price_cache (
  card_key text PRIMARY KEY,
  payload jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_card_price_cache_expires ON public.card_price_cache (expires_at);
ALTER TABLE public.card_price_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "price cache readable" ON public.card_price_cache;
CREATE POLICY "price cache readable" ON public.card_price_cache FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.graded_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_card_id uuid NOT NULL REFERENCES public.vault_cards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  grader text NOT NULL,
  cert_number text NOT NULL,
  grade text,
  pop_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  slab_image_url text,
  verified_at timestamptz,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (grader, cert_number)
);
CREATE INDEX IF NOT EXISTS idx_graded_cards_vault ON public.graded_cards (vault_card_id);
CREATE INDEX IF NOT EXISTS idx_graded_cards_user ON public.graded_cards (user_id);
ALTER TABLE public.graded_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "graded cards owner read" ON public.graded_cards;
CREATE POLICY "graded cards owner read" ON public.graded_cards FOR SELECT
  USING (auth.uid() = user_id OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner'));
DROP POLICY IF EXISTS "graded cards owner insert" ON public.graded_cards;
CREATE POLICY "graded cards owner insert" ON public.graded_cards FOR INSERT
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "graded cards owner update" ON public.graded_cards;
CREATE POLICY "graded cards owner update" ON public.graded_cards FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "graded cards owner delete" ON public.graded_cards;
CREATE POLICY "graded cards owner delete" ON public.graded_cards FOR DELETE
  USING (auth.uid() = user_id OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner'));

DROP TRIGGER IF EXISTS trg_graded_cards_updated_at ON public.graded_cards;
CREATE TRIGGER trg_graded_cards_updated_at BEFORE UPDATE ON public.graded_cards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
