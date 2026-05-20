DO $$
DECLARE
  safe_cols text;
BEGIN
  SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
    INTO safe_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'live_streams'
    AND column_name NOT IN ('cf_live_input_id', 'cf_rtmps_url', 'cf_stream_key');

  EXECUTE 'REVOKE SELECT, INSERT, UPDATE ON public.live_streams FROM anon, authenticated';
  EXECUTE format('GRANT SELECT (%s) ON public.live_streams TO anon, authenticated', safe_cols);
  EXECUTE format('GRANT INSERT (%s) ON public.live_streams TO authenticated', safe_cols);
  EXECUTE format('GRANT UPDATE (%s) ON public.live_streams TO authenticated', safe_cols);
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_stream_credentials TO authenticated;