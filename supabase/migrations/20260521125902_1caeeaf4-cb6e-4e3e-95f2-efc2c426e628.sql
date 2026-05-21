
-- 1) Idempotent confirm_live_stream_active (some envs may already have it)
CREATE OR REPLACE FUNCTION public.confirm_live_stream_active(_stream_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.live_streams
     SET last_host_confirmed_at = now(),
         last_activity_at = now(),
         last_activity_type = 'host_confirm',
         inactivity_warning_at = NULL,
         inactivity_auto_end_after = NULL
   WHERE id = _stream_id
     AND seller_id = auth.uid()
     AND status = 'live';
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_live_stream_active(uuid) TO authenticated;

-- 2) Server-side sweep — runs without an auth context (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.sweep_inactive_streams()
RETURNS TABLE(ended_stream_id uuid, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  -- Auto-end streams past their auto-end window
  FOR r IN
    SELECT ls.id, ls.creator_tier, ls.last_activity_at, ls.last_host_confirmed_at,
           COALESCE(cst.inactive_auto_end_minutes, 40) AS auto_end_min,
           COALESCE(cst.inactive_warning_minutes, 30)  AS warn_min
      FROM public.live_streams ls
      LEFT JOIN public.creator_stream_tiers cst
             ON cst.tier = COALESCE(ls.creator_tier, 'standard')
     WHERE ls.status = 'live'
       AND ls.last_activity_at IS NOT NULL
  LOOP
    -- already-confirmed window? skip
    IF r.last_host_confirmed_at IS NOT NULL
       AND r.last_host_confirmed_at > now() - make_interval(mins => r.warn_min)
    THEN
      CONTINUE;
    END IF;

    IF r.last_activity_at < now() - make_interval(mins => r.auto_end_min) THEN
      UPDATE public.live_streams
         SET status = 'ended',
             ended_at = now(),
             is_active = false,
             auto_end_reason = 'inactivity_auto_end'
       WHERE id = r.id AND status = 'live';
      ended_stream_id := r.id;
      reason := 'inactivity_auto_end';
      RETURN NEXT;
    ELSIF r.last_activity_at < now() - make_interval(mins => r.warn_min) THEN
      UPDATE public.live_streams
         SET inactivity_warning_at = COALESCE(inactivity_warning_at, now()),
             inactivity_auto_end_after = now() + make_interval(mins => r.auto_end_min - r.warn_min)
       WHERE id = r.id AND status = 'live';
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sweep_inactive_streams() TO authenticated, service_role;

-- 3) Indexes
CREATE INDEX IF NOT EXISTS idx_live_streams_status_activity
  ON public.live_streams (status, last_activity_at)
  WHERE status = 'live';

CREATE INDEX IF NOT EXISTS idx_live_stream_presence_recent
  ON public.live_stream_presence (stream_id, last_seen_at DESC);

-- 4) Cron — runs every 2 minutes; safe to re-run
DO $$
BEGIN
  PERFORM cron.unschedule('sweep-inactive-streams');
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

SELECT cron.schedule(
  'sweep-inactive-streams',
  '*/2 * * * *',
  $$ SELECT public.sweep_inactive_streams(); $$
);
