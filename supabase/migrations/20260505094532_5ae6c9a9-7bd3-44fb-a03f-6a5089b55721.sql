
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS current_streak integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS longest_streak integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_login_date date;

ALTER TABLE public.follows
  ADD COLUMN IF NOT EXISTS notify_on_live boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.bump_login_streak()
RETURNS TABLE(current_streak integer, longest_streak integer, last_login_date date)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _u uuid := auth.uid();
  _today date := (now() at time zone 'utc')::date;
  _last date;
  _cur integer;
  _long integer;
BEGIN
  IF _u IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT p.last_login_date, p.current_streak, p.longest_streak
    INTO _last, _cur, _long
  FROM public.profiles p WHERE p.id = _u;
  IF _last IS NULL THEN
    _cur := 1;
  ELSIF _last = _today THEN
    _cur := COALESCE(_cur, 1);
  ELSIF _last = _today - 1 THEN
    _cur := COALESCE(_cur, 0) + 1;
  ELSE
    _cur := 1;
  END IF;
  _long := GREATEST(COALESCE(_long, 0), _cur);
  UPDATE public.profiles
    SET current_streak = _cur,
        longest_streak = _long,
        last_login_date = _today
    WHERE id = _u;
  RETURN QUERY SELECT _cur, _long, _today;
END;
$$;
