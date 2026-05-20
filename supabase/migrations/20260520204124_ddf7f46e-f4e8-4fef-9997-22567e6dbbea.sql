GRANT SELECT ON public.live_streams TO anon, authenticated;
GRANT INSERT, UPDATE ON public.live_streams TO authenticated;

ALTER TABLE public.live_streams
  ALTER COLUMN cf_live_input_id SET DEFAULT NULL,
  ALTER COLUMN cf_rtmps_url SET DEFAULT NULL,
  ALTER COLUMN cf_stream_key SET DEFAULT NULL;