
ALTER TABLE public.stream_tips
  ADD COLUMN IF NOT EXISTS platform_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streamer_payout numeric NOT NULL DEFAULT 0;

ALTER TABLE public.stream_promotions
  ADD COLUMN IF NOT EXISTS duration_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promotion_ends_at timestamptz;

ALTER TABLE public.live_streams
  ADD COLUMN IF NOT EXISTS promotion_active_until timestamptz;

CREATE INDEX IF NOT EXISTS idx_live_streams_promotion_active_until
  ON public.live_streams(promotion_active_until DESC NULLS LAST);
