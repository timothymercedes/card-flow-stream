
-- Live promotions table
CREATE TABLE public.stream_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id uuid NOT NULL REFERENCES public.live_streams(id) ON DELETE CASCADE,
  promoter_id uuid NOT NULL,
  promoter_username text NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 1),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','refunded')),
  stripe_payment_intent_id text,
  message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

CREATE INDEX idx_stream_promotions_stream ON public.stream_promotions(stream_id, created_at DESC);
CREATE INDEX idx_stream_promotions_promoter ON public.stream_promotions(promoter_id, created_at DESC);

ALTER TABLE public.stream_promotions ENABLE ROW LEVEL SECURITY;

-- Anyone can read paid promotions (for display); promoter can see own pending
CREATE POLICY "Public can view paid promotions"
  ON public.stream_promotions FOR SELECT
  USING (status = 'paid' OR promoter_id = auth.uid());

-- Only service role inserts/updates (via server fn + webhook)
CREATE POLICY "Service role manages promotions"
  ON public.stream_promotions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Add fields to live_streams
ALTER TABLE public.live_streams
  ADD COLUMN IF NOT EXISTS promotions_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS promotion_min_amount numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS promotion_score numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_promoted_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_promoted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_live_streams_promotion_score
  ON public.live_streams(promotion_score DESC) WHERE is_active = true;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.stream_promotions;
ALTER TABLE public.stream_promotions REPLICA IDENTITY FULL;
