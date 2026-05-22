
-- 1. Extend queue_offers for binding commitments
ALTER TABLE public.queue_offers
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  ADD COLUMN IF NOT EXISTS payment_intent_id text,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS auth_amount_cents integer,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_method_id text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS captured_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS order_id uuid,
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'sandbox';

-- Backfill: mark all pre-existing rows as legacy (no PI) so the new flow ignores them
UPDATE public.queue_offers
  SET payment_status = 'legacy'
  WHERE payment_intent_id IS NULL AND payment_status = 'pending' AND created_at < now() - interval '1 minute';

CREATE INDEX IF NOT EXISTS idx_queue_offers_buyer_status ON public.queue_offers(buyer_id, status);
CREATE INDEX IF NOT EXISTS idx_queue_offers_expiry_sweep ON public.queue_offers(expires_at)
  WHERE status = 'pending' AND payment_status = 'authorized';

-- 2. Anti-abuse event log
CREATE TABLE IF NOT EXISTS public.offer_abuse_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('unpaid_offer','cancel','auth_failed','spam','capture_failed','expired')),
  queue_item_id uuid,
  offer_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offer_abuse_user_recent ON public.offer_abuse_events(user_id, created_at DESC);

ALTER TABLE public.offer_abuse_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "abuse_own_read" ON public.offer_abuse_events;
CREATE POLICY "abuse_own_read" ON public.offer_abuse_events
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "abuse_admin_all" ON public.offer_abuse_events;
CREATE POLICY "abuse_admin_all" ON public.offer_abuse_events
  FOR ALL USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. Risk summary view (last 30d)
CREATE OR REPLACE VIEW public.seller_offer_risk AS
SELECT
  user_id,
  count(*) FILTER (WHERE event_type = 'cancel') AS cancels_30d,
  count(*) FILTER (WHERE event_type = 'auth_failed') AS auth_failed_30d,
  count(*) FILTER (WHERE event_type = 'capture_failed') AS capture_failed_30d,
  count(*) FILTER (WHERE event_type = 'spam') AS spam_30d,
  count(*) AS total_30d,
  max(created_at) AS last_event_at
FROM public.offer_abuse_events
WHERE created_at > now() - interval '30 days'
GROUP BY user_id;

-- 4. Validation trigger on queue_offers
CREATE OR REPLACE FUNCTION public.validate_queue_offer()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Offer amount must be positive';
  END IF;
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := now() + interval '24 hours';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_queue_offer ON public.queue_offers;
CREATE TRIGGER trg_validate_queue_offer
  BEFORE INSERT OR UPDATE ON public.queue_offers
  FOR EACH ROW EXECUTE FUNCTION public.validate_queue_offer();
