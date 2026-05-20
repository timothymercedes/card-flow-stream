REVOKE SELECT (cf_live_input_id, cf_rtmps_url, cf_stream_key) ON public.live_streams FROM anon, authenticated;
REVOKE UPDATE (cf_live_input_id, cf_rtmps_url, cf_stream_key) ON public.live_streams FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_stream_credentials TO authenticated;

COMMENT ON COLUMN public.live_streams.cf_live_input_id IS 'Deprecated nullable compatibility field. Do not read from clients; use public.live_stream_credentials for owner-only credentials.';
COMMENT ON COLUMN public.live_streams.cf_rtmps_url IS 'Deprecated nullable compatibility field. Do not read from clients; use public.live_stream_credentials for owner-only credentials.';
COMMENT ON COLUMN public.live_streams.cf_stream_key IS 'Deprecated nullable compatibility field. Do not read from clients; use public.live_stream_credentials for owner-only credentials.';