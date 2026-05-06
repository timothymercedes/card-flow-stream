ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pwe_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pwe_max_order_value numeric NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS pwe_price_usd numeric NOT NULL DEFAULT 0.99,
  ADD COLUMN IF NOT EXISTS pwe_stamp_price_usd numeric NOT NULL DEFAULT 0.78;