
ALTER TABLE public.disputes
  ADD COLUMN IF NOT EXISTS stripe_dispute_id text,
  ADD COLUMN IF NOT EXISTS stripe_charge_id text,
  ADD COLUMN IF NOT EXISTS amount_cents integer;

CREATE UNIQUE INDEX IF NOT EXISTS uq_disputes_stripe_dispute_id
  ON public.disputes (stripe_dispute_id)
  WHERE stripe_dispute_id IS NOT NULL;
