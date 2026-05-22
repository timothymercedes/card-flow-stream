-- Counter-offer extension for queue_offers
ALTER TABLE public.queue_offers
  ADD COLUMN IF NOT EXISTS counter_amount numeric,
  ADD COLUMN IF NOT EXISTS last_action_by text NOT NULL DEFAULT 'buyer',
  ADD COLUMN IF NOT EXISTS last_action_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS turn text NOT NULL DEFAULT 'seller';

-- Widen status constraint to include 'countered' and 'cancelled' (and keep existing values + voided)
ALTER TABLE public.queue_offers DROP CONSTRAINT IF EXISTS queue_offers_status_check;
ALTER TABLE public.queue_offers
  ADD CONSTRAINT queue_offers_status_check
  CHECK (status = ANY (ARRAY['pending','countered','accepted','declined','expired','cancelled','voided']::text[]));

-- last_action_by / turn constrained
ALTER TABLE public.queue_offers DROP CONSTRAINT IF EXISTS queue_offers_last_action_by_check;
ALTER TABLE public.queue_offers
  ADD CONSTRAINT queue_offers_last_action_by_check
  CHECK (last_action_by IN ('buyer','seller'));

ALTER TABLE public.queue_offers DROP CONSTRAINT IF EXISTS queue_offers_turn_check;
ALTER TABLE public.queue_offers
  ADD CONSTRAINT queue_offers_turn_check
  CHECK (turn IN ('buyer','seller'));

-- Replace expiry-sweep partial index to include countered offers
DROP INDEX IF EXISTS public.idx_queue_offers_expiry_sweep;
CREATE INDEX IF NOT EXISTS idx_queue_offers_expiry_sweep
  ON public.queue_offers (expires_at)
  WHERE status IN ('pending','countered') AND payment_status = 'authorized';
