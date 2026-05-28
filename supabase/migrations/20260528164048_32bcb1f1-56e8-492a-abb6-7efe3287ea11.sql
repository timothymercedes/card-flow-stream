-- 1) Live stream credential columns: revoke direct client access (defense in depth).
--    Credentials live in public.live_stream_credentials (owner-only RLS).
REVOKE SELECT (cf_live_input_id, cf_rtmps_url, cf_stream_key, cf_whip_url)
  ON public.live_streams FROM anon, authenticated;
REVOKE UPDATE (cf_live_input_id, cf_rtmps_url, cf_stream_key, cf_whip_url)
  ON public.live_streams FROM anon, authenticated;
REVOKE INSERT (cf_live_input_id, cf_rtmps_url, cf_stream_key, cf_whip_url)
  ON public.live_streams FROM anon, authenticated;

-- 2) user_combo_streaks: tighten public read policy to owner-only.
DROP POLICY IF EXISTS "Combo streaks viewable in stream" ON public.user_combo_streaks;
CREATE POLICY "Users read own combo streaks"
  ON public.user_combo_streaks
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
