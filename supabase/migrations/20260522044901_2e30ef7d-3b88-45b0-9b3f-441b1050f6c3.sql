ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS platform_fee_cents integer,
  ADD COLUMN IF NOT EXISTS processing_fee_cents integer,
  ADD COLUMN IF NOT EXISTS buyer_processing_fee_cents integer,
  ADD COLUMN IF NOT EXISTS seller_processing_fee_cents integer,
  ADD COLUMN IF NOT EXISTS fee_split_mode text;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_fee_split_mode_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_fee_split_mode_check
  CHECK (fee_split_mode IS NULL OR fee_split_mode IN ('buyer','split','seller_absorbed'));

CREATE INDEX IF NOT EXISTS orders_stream_fee_accounting_idx
  ON public.orders (stream_id, buyer_id, fee_index)
  WHERE stream_id IS NOT NULL;