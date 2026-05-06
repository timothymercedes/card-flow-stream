REVOKE EXECUTE ON FUNCTION public.accept_required_legal_documents(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.touch_live_stream_activity(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.confirm_live_stream_active(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.extend_flex_live_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_required_legal_documents(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.touch_live_stream_activity(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_live_stream_active(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.extend_flex_live_session(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_live_stream_safety(_stream_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _changed integer := 0;
BEGIN
  WITH candidates AS (
    SELECT
      ls.id,
      COALESCE(c.inactive_warning_minutes, 45) AS warn_min,
      COALESCE(c.inactive_auto_end_minutes, 75) AS end_min,
      COALESCE(c.flex_soft_limit_minutes, 180) AS flex_min
    FROM public.live_streams ls
    LEFT JOIN public.creator_stream_tiers c ON c.tier = ls.creator_tier
    WHERE ls.status = 'live'
      AND (_stream_id IS NULL OR ls.id = _stream_id)
  ), warned AS (
    UPDATE public.live_streams ls
    SET inactivity_warning_at = now(),
        inactivity_auto_end_after = now() + make_interval(mins => c.end_min - c.warn_min)
    FROM candidates c
    WHERE ls.id = c.id
      AND ls.inactivity_warning_at IS NULL
      AND ls.last_activity_at < now() - make_interval(mins => c.warn_min)
    RETURNING ls.id
  ), flex_reminded AS (
    UPDATE public.live_streams ls
    SET stream_soft_reminder_at = now()
    FROM candidates c
    WHERE ls.id = c.id
      AND ls.stream_type = 'show_off'
      AND ls.started_at IS NOT NULL
      AND COALESCE(ls.flex_extended_until, ls.started_at) < now()
      AND ls.started_at < now() - make_interval(mins => c.flex_min)
      AND (ls.stream_soft_reminder_at IS NULL OR ls.stream_soft_reminder_at < now() - interval '30 minutes')
    RETURNING ls.id
  ), ended AS (
    UPDATE public.live_streams ls
    SET status = 'ended',
        is_active = false,
        ended_at = now(),
        auto_end_reason = 'extended_inactivity',
        pause_until = NULL,
        ko_active = false
    FROM candidates c
    WHERE ls.id = c.id
      AND ls.last_activity_at < now() - make_interval(mins => c.end_min)
      AND (ls.inactivity_auto_end_after IS NULL OR ls.inactivity_auto_end_after <= now())
    RETURNING ls.id
  )
  SELECT (SELECT count(*) FROM warned) + (SELECT count(*) FROM flex_reminded) + (SELECT count(*) FROM ended)
  INTO _changed;

  RETURN COALESCE(_changed, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_live_stream_safety(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_live_stream_safety(uuid) TO anon, authenticated;