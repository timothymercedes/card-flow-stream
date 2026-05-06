
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_reason text,
  ADD COLUMN IF NOT EXISTS verification_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS report_count integer NOT NULL DEFAULT 0;

-- Backfill: anyone approved as seller or already live-verified remains permanently verified
UPDATE public.profiles
SET verification_status = 'approved',
    verified_at = COALESCE(verified_at, now())
WHERE verification_status IN ('none','') AND (seller_status = 'approved' OR live_verified = true);

-- Allow admins to update any profile (needed for verification actions via RPC; RPCs are SECURITY DEFINER but keep policy for direct admin tooling)
DROP POLICY IF EXISTS "Admins update profiles" ON public.profiles;
CREATE POLICY "Admins update profiles" ON public.profiles
  FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

-- User submits a verification request
CREATE OR REPLACE FUNCTION public.request_verification(_kind text DEFAULT 'seller', _note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _cur text;
  _username text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _kind NOT IN ('seller','live_host') THEN RAISE EXCEPTION 'Invalid verification kind'; END IF;

  SELECT verification_status, username INTO _cur, _username FROM public.profiles WHERE id = _uid;

  IF _cur = 'approved' THEN
    RETURN jsonb_build_object('status','approved','message','Already verified');
  END IF;

  UPDATE public.profiles
  SET verification_status = 'pending',
      verification_requested_at = now(),
      verification_reason = _note,
      verification_history = verification_history || jsonb_build_object(
        'event','requested','kind',_kind,'note',_note,'at',now()
      ),
      seller_status = CASE WHEN _kind = 'seller' AND seller_status = 'none' THEN 'pending' ELSE seller_status END
  WHERE id = _uid;

  -- Notify admins/owners
  INSERT INTO public.notifications (user_id, sender_id, type, body, link)
  SELECT ur.user_id, _uid, 'verification_request',
         '🪪 New ' || _kind || ' verification: @' || COALESCE(_username,'user'),
         '/admin'
  FROM public.user_roles ur
  WHERE ur.role IN ('admin','owner')
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('status','pending');
END;
$$;

-- Admin approves / denies / forces re-verify
CREATE OR REPLACE FUNCTION public.admin_set_verification_status(
  _target_user uuid,
  _status text,
  _reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _caller uuid := auth.uid(); _username text;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_role(_caller,'admin') OR public.has_role(_caller,'owner') OR public.has_role(_caller,'moderator')) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  IF _status NOT IN ('approved','denied','reverify_required','pending') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  SELECT username INTO _username FROM public.profiles WHERE id = _target_user;

  UPDATE public.profiles
  SET verification_status = _status,
      verified_at = CASE WHEN _status = 'approved' THEN COALESCE(verified_at, now()) ELSE verified_at END,
      live_verified = CASE WHEN _status = 'approved' THEN true
                           WHEN _status IN ('denied','reverify_required') THEN false
                           ELSE live_verified END,
      seller_status = CASE
        WHEN _status = 'approved' AND seller_status IN ('pending','none') THEN 'approved'
        WHEN _status = 'denied' AND seller_status = 'pending' THEN 'denied'
        WHEN _status = 'reverify_required' AND seller_status = 'approved' THEN 'pending'
        ELSE seller_status END,
      verification_reason = _reason,
      verification_history = verification_history || jsonb_build_object(
        'event',_status,'by',_caller,'reason',_reason,'at',now()
      )
  WHERE id = _target_user;

  INSERT INTO public.notifications (user_id, sender_id, type, body, link)
  VALUES (
    _target_user, _caller,
    'verification_' || _status,
    CASE _status
      WHEN 'approved' THEN '✅ Your account is verified! You can now host & sell.'
      WHEN 'denied' THEN '❌ Verification denied' || COALESCE(': ' || _reason, '')
      WHEN 'reverify_required' THEN '⚠️ Re-verification required' || COALESCE(': ' || _reason, '')
      ELSE 'Verification updated'
    END,
    '/profile'
  );
END;
$$;

-- Admin list of verification requests (pending + reverify_required) with report count
CREATE OR REPLACE FUNCTION public.admin_list_verification_requests(_limit integer DEFAULT 100)
RETURNS TABLE (
  id uuid,
  username text,
  avatar_url text,
  verification_status text,
  verification_requested_at timestamptz,
  verification_reason text,
  seller_status text,
  live_verified boolean,
  verified_at timestamptz,
  report_count bigint,
  created_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.username, p.avatar_url, p.verification_status,
         p.verification_requested_at, p.verification_reason,
         p.seller_status, p.live_verified, p.verified_at,
         COALESCE((SELECT COUNT(*) FROM public.user_reports ur WHERE ur.target_id = p.id AND ur.target_type = 'user'), 0),
         p.created_at
  FROM public.profiles p
  WHERE (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'moderator'))
    AND p.verification_status IN ('pending','reverify_required')
  ORDER BY p.verification_requested_at DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(_limit, 200));
$$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
