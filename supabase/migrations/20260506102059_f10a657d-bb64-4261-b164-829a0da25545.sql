
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS seller_agreement_version text,
  ADD COLUMN IF NOT EXISTS seller_agreement_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS seller_agreement_review_required boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.accept_seller_agreement(_version text DEFAULT '1.0', _user_agent text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _at timestamptz := now();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  INSERT INTO public.legal_acceptances (user_id, document_type, version, user_agent, accepted_at)
  VALUES (_uid, 'seller_agreement', _version, LEFT(_user_agent, 200), _at)
  ON CONFLICT (user_id, document_type, version) DO UPDATE
    SET accepted_at = COALESCE(public.legal_acceptances.accepted_at, EXCLUDED.accepted_at);

  UPDATE public.profiles
  SET seller_agreement_version = _version,
      seller_agreement_accepted_at = _at,
      seller_agreement_review_required = false
  WHERE id = _uid;

  RETURN jsonb_build_object('version', _version, 'accepted_at', _at);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_force_seller_reaccept(_target_user uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _caller uuid := auth.uid();
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_role(_caller, 'admin') OR public.has_role(_caller, 'owner')) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  UPDATE public.profiles
  SET seller_agreement_review_required = true
  WHERE id = _target_user;

  INSERT INTO public.notifications (user_id, sender_id, type, body, link)
  VALUES (_target_user, _caller, 'seller_agreement_reaccept',
    '⚠️ Please re-accept the Seller / Host Agreement to continue selling or going live.' || COALESCE(' Reason: ' || _reason, ''),
    '/legal/seller-host-agreement');
END;
$$;
