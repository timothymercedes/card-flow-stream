CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_privileged boolean;
  cu text := current_user;
BEGIN
  -- Bypass when running via service role, postgres, or any SECURITY DEFINER
  -- function owned by an elevated role.
  IF cu IN ('postgres', 'supabase_admin', 'service_role', 'authenticator') THEN
    RETURN NEW;
  END IF;

  -- No JWT (server context) — let it through.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  is_privileged := public.has_role(auth.uid(), 'admin'::app_role)
                OR public.has_role(auth.uid(), 'owner'::app_role);

  IF is_privileged THEN
    RETURN NEW;
  END IF;

  NEW.is_seller := OLD.is_seller;
  NEW.buyer_verified := OLD.buyer_verified;
  NEW.id_status := OLD.id_status;
  NEW.id_document_url := OLD.id_document_url;
  NEW.seller_status := OLD.seller_status;
  NEW.phone_verified := OLD.phone_verified;
  NEW.phone_verified_at := OLD.phone_verified_at;
  NEW.stripe_account_id := OLD.stripe_account_id;
  NEW.stripe_payouts_enabled := OLD.stripe_payouts_enabled;
  NEW.stripe_charges_enabled := OLD.stripe_charges_enabled;
  NEW.stripe_onboarding_status := OLD.stripe_onboarding_status;
  NEW.live_verified := OLD.live_verified;
  NEW.age_verified := OLD.age_verified;
  NEW.age_verified_at := OLD.age_verified_at;
  NEW.tos_accepted := OLD.tos_accepted;
  NEW.tos_accepted_at := OLD.tos_accepted_at;
  NEW.guidelines_accepted := OLD.guidelines_accepted;
  NEW.guidelines_accepted_at := OLD.guidelines_accepted_at;
  NEW.agreements_version := OLD.agreements_version;
  NEW.agreements_completed_at := OLD.agreements_completed_at;
  NEW.agreements_review_required := OLD.agreements_review_required;
  NEW.creator_tier := OLD.creator_tier;
  NEW.verification_status := OLD.verification_status;
  NEW.verified_at := OLD.verified_at;
  NEW.verification_reason := OLD.verification_reason;
  NEW.verification_requested_at := OLD.verification_requested_at;
  NEW.verification_history := OLD.verification_history;
  NEW.public_id := OLD.public_id;
  NEW.id := OLD.id;

  RETURN NEW;
END;
$$;
