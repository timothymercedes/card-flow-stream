-- Remove deprecated, publicly-readable Cloudflare credential columns from live_streams.
-- Credentials now live exclusively in public.live_stream_credentials (owner-only RLS).
DROP TRIGGER IF EXISTS trg_live_streams_strip_deprecated_credentials ON public.live_streams;
DROP FUNCTION IF EXISTS public.live_streams_strip_deprecated_credentials();

ALTER TABLE public.live_streams DROP COLUMN IF EXISTS cf_stream_key;
ALTER TABLE public.live_streams DROP COLUMN IF EXISTS cf_rtmps_url;
ALTER TABLE public.live_streams DROP COLUMN IF EXISTS cf_live_input_id;