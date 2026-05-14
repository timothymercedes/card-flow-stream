ALTER TABLE public.auction_queue ADD COLUMN IF NOT EXISTS quantity int NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 999);

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS shipping_preset text,
  ADD COLUMN IF NOT EXISTS weight_oz numeric,
  ADD COLUMN IF NOT EXISTS length_in numeric,
  ADD COLUMN IF NOT EXISTS width_in numeric,
  ADD COLUMN IF NOT EXISTS height_in numeric;