
-- Notifications & push: indexes, delete policy, auto-cleanup
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON public.push_subscriptions (user_id);

-- Allow users to delete their own notifications
DROP POLICY IF EXISTS "Users delete own notifications" ON public.notifications;
CREATE POLICY "Users delete own notifications"
  ON public.notifications FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Auto-purge read notifications older than 30 days, and any notification older than 90 days
CREATE OR REPLACE FUNCTION public.purge_old_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _n integer;
BEGIN
  WITH d AS (
    DELETE FROM public.notifications
    WHERE (read = true AND created_at < now() - interval '30 days')
       OR (created_at < now() - interval '90 days')
    RETURNING 1
  )
  SELECT count(*) INTO _n FROM d;
  RETURN COALESCE(_n, 0);
END;
$$;

SELECT cron.unschedule('purge_old_notifications')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge_old_notifications');

SELECT cron.schedule(
  'purge_old_notifications',
  '17 4 * * *',
  $$SELECT public.purge_old_notifications();$$
);
