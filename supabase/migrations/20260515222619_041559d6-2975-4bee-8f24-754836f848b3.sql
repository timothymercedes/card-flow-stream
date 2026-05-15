-- Webhook event dedupe (idempotency at handler level)
CREATE TABLE IF NOT EXISTS public.processed_webhook_events (
  provider text NOT NULL,
  event_id text NOT NULL,
  event_type text,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, event_id)
);

ALTER TABLE public.processed_webhook_events ENABLE ROW LEVEL SECURITY;

-- Only service role writes/reads. No public policies = denied by RLS.
COMMENT ON TABLE public.processed_webhook_events IS
  'Dedupe table for incoming webhook events (Stripe, Shippo, etc). Service-role only.';

-- Auto-clean old entries after 30 days to keep table small
CREATE INDEX IF NOT EXISTS idx_processed_webhook_events_processed_at
  ON public.processed_webhook_events (processed_at);