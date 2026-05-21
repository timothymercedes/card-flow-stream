
-- Bundle-aware fee tracking
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS fee_index integer,
  ADD COLUMN IF NOT EXISTS fee_absorbed_by text CHECK (fee_absorbed_by IN ('buyer','seller'));

CREATE INDEX IF NOT EXISTS orders_buyer_stream_paid_idx
  ON public.orders (buyer_id, stream_id, paid_at)
  WHERE payment_status = 'paid' AND stream_id IS NOT NULL;

-- Returns the platform fee (in cents) that should apply to the *next* order
-- a buyer makes within a given live stream group.
-- Items 1-3 → 123¢ (buyer pays). Items 4+ → 0¢ (seller absorbs equivalent).
CREATE OR REPLACE FUNCTION public.compute_buyer_fee_cents(
  _buyer_id uuid,
  _stream_id uuid,
  _default_cents integer DEFAULT 123,
  _threshold integer DEFAULT 3
) RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  paid_count integer;
BEGIN
  IF _stream_id IS NULL THEN
    RETURN _default_cents;
  END IF;
  SELECT COUNT(*) INTO paid_count
  FROM public.orders
  WHERE buyer_id = _buyer_id
    AND stream_id = _stream_id
    AND payment_status = 'paid';
  IF paid_count >= _threshold THEN
    RETURN 0;
  END IF;
  RETURN _default_cents;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_buyer_fee_cents(uuid, uuid, integer, integer) TO authenticated, anon, service_role;

-- Multilingual scanner: track card language on identity rows
ALTER TABLE public.card_identities
  ADD COLUMN IF NOT EXISTS language text DEFAULT 'en';

CREATE INDEX IF NOT EXISTS card_identities_language_idx
  ON public.card_identities (language);
