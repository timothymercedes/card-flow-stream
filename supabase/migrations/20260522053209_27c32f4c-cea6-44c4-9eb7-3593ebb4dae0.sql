ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tax_cents INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxable_subtotal_cents INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_rate_bps INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_jurisdiction TEXT,
  ADD COLUMN IF NOT EXISTS tax_provider TEXT,
  ADD COLUMN IF NOT EXISTS tax_country TEXT,
  ADD COLUMN IF NOT EXISTS tax_state TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_tax_jurisdiction ON public.orders(tax_jurisdiction) WHERE tax_jurisdiction IS NOT NULL;