
CREATE TABLE IF NOT EXISTS public.card_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_key text NOT NULL,
  name text NOT NULL,
  tcg_set text,
  tcg_number text,
  market_price numeric,
  price_low numeric,
  price_high numeric,
  last_sold_price numeric,
  source text,
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cph_key_time ON public.card_price_history (card_key, captured_at DESC);

ALTER TABLE public.card_price_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Price history readable by authenticated" ON public.card_price_history;
CREATE POLICY "Price history readable by authenticated"
ON public.card_price_history FOR SELECT
TO authenticated
USING (true);

-- helper to compute a canonical card key
CREATE OR REPLACE FUNCTION public.compute_card_key(_name text, _set text, _number text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(coalesce(_name,'')) || '|' || lower(coalesce(_set,'')) || '|' || lower(coalesce(_number,''))
$$;
