
-- 1) Message-request: optional first message
ALTER TABLE public.message_requests
  ADD COLUMN IF NOT EXISTS request_message text;

-- 2) One open live per host (status live or paused)
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_open_live_per_seller
  ON public.live_streams (seller_id)
  WHERE status IN ('live', 'paused');

-- 3) Pause message
ALTER TABLE public.live_streams
  ADD COLUMN IF NOT EXISTS pause_message text,
  ADD COLUMN IF NOT EXISTS pause_started_at timestamptz;

-- 4) Streaming badges on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS total_stream_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streaming_badge text NOT NULL DEFAULT 'none';

CREATE OR REPLACE FUNCTION public.add_stream_minutes(_user_id uuid, _minutes integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total integer;
  badge text;
BEGIN
  IF _minutes IS NULL OR _minutes <= 0 THEN RETURN; END IF;
  UPDATE public.profiles
    SET total_stream_minutes = total_stream_minutes + _minutes
    WHERE id = _user_id
    RETURNING total_stream_minutes INTO total;
  IF total IS NULL THEN RETURN; END IF;
  badge := CASE
    WHEN total >= 3000 THEN 'platinum'
    WHEN total >= 500  THEN 'gold'
    WHEN total >= 100  THEN 'silver'
    ELSE 'none'
  END;
  UPDATE public.profiles SET streaming_badge = badge WHERE id = _user_id;
END;
$$;
