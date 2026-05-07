-- Schedule pg_cron job to purge stale live_stream_presence rows every minute.
-- Anyone idle >2 minutes is removed so viewer counts stay accurate.

DO $$
BEGIN
  -- Unschedule any prior version of this job (idempotent).
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'purge_stale_stream_presence';
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'purge_stale_stream_presence',
  '* * * * *',
  $$DELETE FROM public.live_stream_presence WHERE last_seen_at < now() - interval '2 minutes'$$
);

-- Also purge orphan cohost track rows whose owners haven't heartbeat'd in 5 minutes.
DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'purge_stale_cohost_tracks';
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'purge_stale_cohost_tracks',
  '*/2 * * * *',
  $$DELETE FROM public.stream_cohost_tracks t
    WHERE NOT EXISTS (
      SELECT 1 FROM public.live_stream_presence p
      WHERE p.stream_id = t.stream_id AND p.user_id = t.user_id
    )
    AND t.updated_at < now() - interval '5 minutes'$$
);
