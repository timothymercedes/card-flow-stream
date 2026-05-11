CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS public.tcg_prices (
  id BIGSERIAL PRIMARY KEY,
  game TEXT NOT NULL,
  tcgplayer_product_id BIGINT NOT NULL,
  name TEXT NOT NULL,
  clean_name TEXT NOT NULL,
  set_name TEXT,
  number TEXT,
  rarity TEXT,
  image_url TEXT,
  market_price NUMERIC,
  low_price NUMERIC,
  mid_price NUMERIC,
  high_price NUMERIC,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (game, tcgplayer_product_id)
);

CREATE INDEX IF NOT EXISTS idx_tcg_prices_game_cleanname ON public.tcg_prices (game, clean_name);
CREATE INDEX IF NOT EXISTS idx_tcg_prices_cleanname_trgm ON public.tcg_prices USING gin (clean_name gin_trgm_ops);

ALTER TABLE public.tcg_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tcg_prices public read"
ON public.tcg_prices FOR SELECT
USING (true);