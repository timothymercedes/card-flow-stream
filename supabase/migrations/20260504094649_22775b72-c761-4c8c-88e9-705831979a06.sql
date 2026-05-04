ALTER TABLE public.live_streams 
  ADD COLUMN IF NOT EXISTS cf_live_input_id text,
  ADD COLUMN IF NOT EXISTS cf_rtmps_url text,
  ADD COLUMN IF NOT EXISTS cf_stream_key text,
  ADD COLUMN IF NOT EXISTS cf_playback_hls text,
  ADD COLUMN IF NOT EXISTS cf_video_uid text;

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS buy_now_price numeric;