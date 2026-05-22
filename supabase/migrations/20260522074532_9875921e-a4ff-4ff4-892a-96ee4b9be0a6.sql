ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS label_cost_cents bigint,
  ADD COLUMN IF NOT EXISTS shipping_margin_cents bigint;