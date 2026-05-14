
-- Phase 4: Advanced reminder system

-- Track which reminders we've already sent to avoid duplicates
ALTER TABLE public.show_bookmarks
  ADD COLUMN IF NOT EXISTS reminder_24h_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_1h_sent_at  timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_live_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_show_bookmarks_show_id ON public.show_bookmarks(show_id);
CREATE INDEX IF NOT EXISTS idx_show_bookmarks_user_id ON public.show_bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_shows_scheduled_for ON public.scheduled_shows(scheduled_for);

-- Per-user notification preferences: timezone + quiet hours window
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS notify_quiet_start smallint,  -- hour 0-23, null = disabled
  ADD COLUMN IF NOT EXISTS notify_quiet_end   smallint;  -- hour 0-23

-- Helper: returns true if "now" in user's local tz falls within their quiet hours.
CREATE OR REPLACE FUNCTION public.is_in_quiet_hours(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tz text;
  qs smallint;
  qe smallint;
  hr smallint;
BEGIN
  SELECT COALESCE(timezone, 'UTC'), notify_quiet_start, notify_quiet_end
    INTO tz, qs, qe
    FROM profiles WHERE id = _user_id;
  IF qs IS NULL OR qe IS NULL THEN RETURN false; END IF;
  hr := EXTRACT(HOUR FROM (now() AT TIME ZONE tz))::smallint;
  IF qs = qe THEN RETURN false; END IF;
  IF qs < qe THEN
    RETURN hr >= qs AND hr < qe;
  ELSE
    -- Window wraps midnight (e.g. 22 -> 7)
    RETURN hr >= qs OR hr < qe;
  END IF;
END;
$$;
