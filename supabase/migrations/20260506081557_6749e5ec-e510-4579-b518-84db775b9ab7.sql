ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS age_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS age_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS tos_accepted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tos_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS guidelines_accepted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS guidelines_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS agreements_version text NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS agreements_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS agreements_review_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS creator_tier text NOT NULL DEFAULT 'standard';

CREATE UNIQUE INDEX IF NOT EXISTS legal_acceptances_user_document_version_idx
  ON public.legal_acceptances(user_id, document_type, version);

CREATE OR REPLACE FUNCTION public.accept_required_legal_documents(_version text DEFAULT '1.0', _user_agent text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _accepted_at timestamptz := now();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.legal_acceptances (user_id, document_type, version, user_agent, accepted_at)
  VALUES
    (_uid, 'age_18_plus', _version, _user_agent, _accepted_at),
    (_uid, 'tos', _version, _user_agent, _accepted_at),
    (_uid, 'privacy', _version, _user_agent, _accepted_at),
    (_uid, 'community_guidelines', _version, _user_agent, _accepted_at)
  ON CONFLICT (user_id, document_type, version) DO UPDATE
    SET user_agent = COALESCE(EXCLUDED.user_agent, public.legal_acceptances.user_agent),
        accepted_at = COALESCE(public.legal_acceptances.accepted_at, EXCLUDED.accepted_at);

  UPDATE public.profiles
  SET age_verified = true,
      age_verified_at = COALESCE(age_verified_at, _accepted_at),
      tos_accepted = true,
      tos_accepted_at = COALESCE(tos_accepted_at, _accepted_at),
      guidelines_accepted = true,
      guidelines_accepted_at = COALESCE(guidelines_accepted_at, _accepted_at),
      agreements_version = _version,
      agreements_completed_at = COALESCE(agreements_completed_at, _accepted_at),
      agreements_review_required = false
  WHERE id = _uid;

  RETURN jsonb_build_object(
    'age_verified', true,
    'tos_accepted', true,
    'guidelines_accepted', true,
    'agreements_version', _version,
    'agreements_completed_at', _accepted_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_required_legal_documents(text, text) TO authenticated;

ALTER TABLE public.live_streams
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_activity_type text NOT NULL DEFAULT 'created',
  ADD COLUMN IF NOT EXISTS last_host_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS inactivity_warning_at timestamptz,
  ADD COLUMN IF NOT EXISTS inactivity_auto_end_after timestamptz,
  ADD COLUMN IF NOT EXISTS stream_soft_reminder_at timestamptz,
  ADD COLUMN IF NOT EXISTS flex_extended_until timestamptz,
  ADD COLUMN IF NOT EXISTS auto_end_reason text,
  ADD COLUMN IF NOT EXISTS creator_tier text NOT NULL DEFAULT 'standard';

CREATE INDEX IF NOT EXISTS live_streams_activity_idx
  ON public.live_streams(status, last_activity_at, inactivity_auto_end_after);

CREATE TABLE IF NOT EXISTS public.creator_stream_tiers (
  tier text PRIMARY KEY,
  label text NOT NULL,
  inactive_warning_minutes integer NOT NULL DEFAULT 45,
  inactive_auto_end_minutes integer NOT NULL DEFAULT 75,
  flex_soft_limit_minutes integer NOT NULL DEFAULT 180,
  flex_extension_minutes integer NOT NULL DEFAULT 120,
  guest_limit integer NOT NULL DEFAULT 4,
  priority_stream_quality boolean NOT NULL DEFAULT false,
  enhanced_obs_features boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.creator_stream_tiers (tier, label, inactive_warning_minutes, inactive_auto_end_minutes, flex_soft_limit_minutes, flex_extension_minutes, guest_limit, priority_stream_quality, enhanced_obs_features)
VALUES
  ('standard', 'Standard creator', 45, 75, 180, 120, 4, false, false),
  ('verified', 'Verified seller', 60, 120, 240, 180, 6, false, true),
  ('premium', 'Premium streamer', 90, 180, 360, 240, 8, true, true),
  ('trusted', 'Trusted creator', 120, 240, 480, 360, 10, true, true)
ON CONFLICT (tier) DO NOTHING;

ALTER TABLE public.creator_stream_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Creator tiers are viewable" ON public.creator_stream_tiers;
CREATE POLICY "Creator tiers are viewable"
ON public.creator_stream_tiers
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Staff manage creator tiers" ON public.creator_stream_tiers;
CREATE POLICY "Staff manage creator tiers"
ON public.creator_stream_tiers
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role));

CREATE OR REPLACE FUNCTION public.touch_live_stream_activity(_stream_id uuid, _activity_type text DEFAULT 'activity')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.live_streams
  SET last_activity_at = now(),
      last_activity_type = LEFT(COALESCE(_activity_type, 'activity'), 80),
      inactivity_warning_at = NULL,
      inactivity_auto_end_after = NULL
  WHERE id = _stream_id
    AND status = 'live'
    AND (
      seller_id = auth.uid()
      OR auth.uid() IS NOT NULL
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.touch_live_stream_activity(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_live_stream_active(_stream_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.live_streams
  SET last_activity_at = now(),
      last_activity_type = 'host_confirmed',
      last_host_confirmed_at = now(),
      inactivity_warning_at = NULL,
      inactivity_auto_end_after = NULL,
      stream_soft_reminder_at = CASE
        WHEN stream_type = 'show_off' THEN now()
        ELSE stream_soft_reminder_at
      END
  WHERE id = _stream_id
    AND seller_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_live_stream_active(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.extend_flex_live_session(_stream_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _until timestamptz;
  _minutes integer;
BEGIN
  SELECT COALESCE(c.flex_extension_minutes, 120)
  INTO _minutes
  FROM public.live_streams ls
  LEFT JOIN public.creator_stream_tiers c ON c.tier = ls.creator_tier
  WHERE ls.id = _stream_id AND ls.seller_id = auth.uid();

  IF _minutes IS NULL THEN
    RAISE EXCEPTION 'Stream not found';
  END IF;

  _until := now() + make_interval(mins => _minutes);

  UPDATE public.live_streams
  SET flex_extended_until = _until,
      stream_soft_reminder_at = now(),
      last_activity_at = now(),
      last_activity_type = 'flex_extended'
  WHERE id = _stream_id
    AND seller_id = auth.uid();

  RETURN _until;
END;
$$;

GRANT EXECUTE ON FUNCTION public.extend_flex_live_session(uuid) TO authenticated;