-- Audit table for every AI scan request
CREATE TABLE IF NOT EXISTS public.card_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  multi boolean NOT NULL DEFAULT false,
  language text,
  cards_detected int NOT NULL DEFAULT 0,
  top_name text,
  top_set text,
  top_value numeric,
  status text NOT NULL DEFAULT 'ok',  -- 'ok' | 'rate_limited' | 'error' | 'no_cards'
  error_message text,
  duration_ms int,
  source text  -- 'vault' | 'sell' | 'live' | etc.
);

CREATE INDEX IF NOT EXISTS card_scans_user_created_idx ON public.card_scans(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS card_scans_status_idx ON public.card_scans(status, created_at DESC) WHERE status <> 'ok';

ALTER TABLE public.card_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own scans" ON public.card_scans
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

-- No INSERT/UPDATE/DELETE policy: only service role (edge function) can write.

-- Rate limit checker — used by scan-card edge function via service role
CREATE OR REPLACE FUNCTION public.rate_limit_card_scan(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hour int;
  _day int;
  _hour_limit int := 30;
  _day_limit int := 200;
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'unauthenticated');
  END IF;

  -- Admins/owners exempt
  IF public.has_role(_user_id, 'admin') OR public.has_role(_user_id, 'owner') THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'admin');
  END IF;

  SELECT COUNT(*) INTO _hour FROM public.card_scans
   WHERE user_id = _user_id AND status = 'ok' AND created_at > now() - interval '1 hour';
  IF _hour >= _hour_limit THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'hour_limit', 'limit', _hour_limit, 'used', _hour);
  END IF;

  SELECT COUNT(*) INTO _day FROM public.card_scans
   WHERE user_id = _user_id AND status = 'ok' AND created_at > now() - interval '24 hours';
  IF _day >= _day_limit THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'day_limit', 'limit', _day_limit, 'used', _day);
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'hour_used', _hour, 'hour_limit', _hour_limit,
    'day_used', _day, 'day_limit', _day_limit
  );
END; $$;

REVOKE EXECUTE ON FUNCTION public.rate_limit_card_scan(uuid) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.rate_limit_card_scan(uuid) TO service_role;