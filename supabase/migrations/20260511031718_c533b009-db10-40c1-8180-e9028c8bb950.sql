
-- 1) Reference library for the manual finder + alternatives cache
CREATE TABLE IF NOT EXISTS public.pokemon_cards (
  id text PRIMARY KEY,                       -- external id (e.g. pokemontcg "base1-4")
  name text NOT NULL,
  set_name text,
  set_code text,
  number text,
  rarity text,
  year text,
  is_holo boolean DEFAULT false,
  is_reverse_holo boolean DEFAULT false,
  subtypes text[],                           -- ['Trainer','Item','Supporter','Pokémon'...]
  image_small text,
  image_large text,
  tcgplayer_price numeric,
  last_sold_price numeric,
  trend text,
  prices_updated_at timestamptz,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pokemon_cards_name ON public.pokemon_cards USING gin (to_tsvector('simple', name));
CREATE INDEX IF NOT EXISTS idx_pokemon_cards_set ON public.pokemon_cards (set_name);
CREATE INDEX IF NOT EXISTS idx_pokemon_cards_number ON public.pokemon_cards (number);
CREATE INDEX IF NOT EXISTS idx_pokemon_cards_rarity ON public.pokemon_cards (rarity);

ALTER TABLE public.pokemon_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pokemon_cards readable to all" ON public.pokemon_cards;
CREATE POLICY "pokemon_cards readable to all"
  ON public.pokemon_cards FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "pokemon_cards admin write" ON public.pokemon_cards;
CREATE POLICY "pokemon_cards admin write"
  ON public.pokemon_cards FOR ALL
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

DROP TRIGGER IF EXISTS trg_pokemon_cards_updated_at ON public.pokemon_cards;
CREATE TRIGGER trg_pokemon_cards_updated_at
  BEFORE UPDATE ON public.pokemon_cards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) Per-user scan history (recents + duplicate tracking + manual corrections)
CREATE TABLE IF NOT EXISTS public.scan_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  image_url text,
  top_name text,
  top_set text,
  top_number text,
  top_rarity text,
  top_variant text,
  top_value numeric,
  overall_confidence numeric,
  alternatives jsonb DEFAULT '[]'::jsonb,
  picked_card_id text,                       -- pokemon_cards.id if user manually corrected
  was_corrected boolean DEFAULT false,
  duplicate_of uuid REFERENCES public.scan_history(id) ON DELETE SET NULL,
  source text,                               -- 'vault' | 'sell' | 'live' | 'showoff'
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scan_history_user_created ON public.scan_history (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_history_user_name ON public.scan_history (user_id, top_name);

ALTER TABLE public.scan_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scan_history owner select" ON public.scan_history;
CREATE POLICY "scan_history owner select"
  ON public.scan_history FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "scan_history owner insert" ON public.scan_history;
CREATE POLICY "scan_history owner insert"
  ON public.scan_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "scan_history owner update" ON public.scan_history;
CREATE POLICY "scan_history owner update"
  ON public.scan_history FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "scan_history owner delete" ON public.scan_history;
CREATE POLICY "scan_history owner delete"
  ON public.scan_history FOR DELETE
  USING (auth.uid() = user_id);

-- 3) Pinned card on live streams for in-stream overlay
ALTER TABLE public.live_streams
  ADD COLUMN IF NOT EXISTS pinned_card jsonb;
