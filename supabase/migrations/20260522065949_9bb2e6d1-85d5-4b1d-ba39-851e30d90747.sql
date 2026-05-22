-- Human-readable order numbers for tracking
CREATE SEQUENCE IF NOT EXISTS public.orders_number_seq START 1000;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_number text;

-- Backfill existing orders by creation order
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.orders WHERE order_number IS NULL ORDER BY created_at ASC LOOP
    UPDATE public.orders
      SET order_number = 'PB-' || lpad(nextval('public.orders_number_seq')::text, 6, '0')
      WHERE id = r.id;
  END LOOP;
END $$;

-- Auto-assign on insert
CREATE OR REPLACE FUNCTION public.assign_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := 'PB-' || lpad(nextval('public.orders_number_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_order_number ON public.orders;
CREATE TRIGGER trg_assign_order_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.assign_order_number();

-- Enforce uniqueness + fast lookup for admin search
CREATE UNIQUE INDEX IF NOT EXISTS orders_order_number_key ON public.orders (order_number);