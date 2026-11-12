-- REVIEW ONLY. NOT APPLIED. Must ship with reviewed root/caller changes.
-- Execute after security-hardening.review.sql ONLY in isolated validation.
-- Browser order creation must first move to trusted, authenticated server handlers.
CREATE OR REPLACE FUNCTION public.model_a_guard_client_order()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE allowed text[]; uid uuid := auth.uid();
BEGIN
  IF auth.role()='service_role' THEN RETURN NEW; END IF;
  IF session_user IN ('postgres','supabase_admin')
     AND NULLIF(current_setting('request.jwt.claims',true),'') IS NULL
     AND NULLIF(current_setting('request.jwt.claim.role',true),'') IS NULL THEN RETURN NEW; END IF;
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'Trusted order creation required' USING ERRCODE='42501'; END IF;
  IF uid=OLD.buyer_id AND OLD.payment_status='awaiting_payment' THEN
    allowed:=ARRAY['ship_name','ship_address','ship_city','ship_state','ship_zip','ship_country'];
  ELSIF uid=OLD.seller_id THEN
    allowed:=ARRAY['tracking_number','tracking_url','carrier'];
  ELSE RAISE EXCEPTION 'Order edits forbidden' USING ERRCODE='42501'; END IF;
  IF (to_jsonb(NEW)-allowed) IS DISTINCT FROM (to_jsonb(OLD)-allowed) THEN
    RAISE EXCEPTION 'Protected order fields cannot be edited' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.model_a_guard_client_order() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.model_a_guard_client_order() TO service_role;
-- Existing UPDATE gate must lose its owner/NULL bypass; the new invoker gate runs too.
CREATE OR REPLACE FUNCTION public.orders_restrict_client_update()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,pg_temp AS $fn$
BEGIN RETURN NEW; END;
$fn$;
REVOKE ALL ON FUNCTION public.orders_restrict_client_update() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.orders_restrict_client_update() TO service_role;
CREATE TRIGGER model_a_client_order_gate BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.model_a_guard_client_order();
REVOKE INSERT,DELETE,UPDATE ON public.orders FROM anon,authenticated;
GRANT UPDATE(ship_name,ship_address,ship_city,ship_state,ship_zip,ship_country,tracking_number,tracking_url,carrier)
ON public.orders TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE allowed text[] := ARRAY['username','avatar_url','full_name','phone','address_line1','address_city','address_state','address_zip','address_country','preferred_currency','preferred_language','a11y_settings','timezone','notify_quiet_start','notify_quiet_end','bio','banner_url','accent_color','social_links','pwe_enabled','pwe_max_order_value','pwe_price_usd','pwe_stamp_price_usd'];
BEGIN
  IF auth.role()='service_role' THEN RETURN NEW; END IF;
  IF session_user IN ('postgres','supabase_admin')
     AND NULLIF(current_setting('request.jwt.claims',true),'') IS NULL
     AND NULLIF(current_setting('request.jwt.claim.role',true),'') IS NULL THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Profile edits forbidden' USING ERRCODE='42501';
  END IF;
  IF (to_jsonb(NEW)-allowed) IS DISTINCT FROM (to_jsonb(OLD)-allowed) THEN
    RAISE EXCEPTION 'Protected profile fields cannot be edited' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.prevent_profile_privilege_escalation() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_profile_privilege_escalation() TO service_role;
-- Existing profile trigger uses this function. Legal/reward/verification roots need service wrappers first.
REVOKE INSERT,DELETE,UPDATE ON public.profiles FROM anon,authenticated;
GRANT UPDATE(username,avatar_url,full_name,phone,address_line1,address_city,address_state,address_zip,address_country,preferred_currency,preferred_language,a11y_settings,timezone,notify_quiet_start,notify_quiet_end,bio,banner_url,accent_color,social_links,pwe_enabled,pwe_max_order_value,pwe_price_usd,pwe_stamp_price_usd)
ON public.profiles TO authenticated;

-- Preserve existing SELECT policies; financial mutation is through scoped trusted roots only.
REVOKE INSERT,UPDATE,DELETE ON public.stripe_accounts,public.seller_trust,public.payout_requests,
public.account_holds,public.hold_recoveries,public.shipping_adjustments,public.platform_payouts,
public.platform_revenue,public.payout_adjustments,public.payout_locks,public.balance_audit_log
FROM anon,authenticated;
-- Dispute/claim creation and evidence must be moved to participant-scoped server handlers first.
REVOKE INSERT,UPDATE,DELETE ON public.disputes,public.insurance_claims FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.orders,public.profiles,public.stripe_accounts,
public.seller_trust,public.payout_requests,public.account_holds,public.hold_recoveries,
public.shipping_adjustments,public.platform_payouts,public.platform_revenue,
public.payout_adjustments,public.payout_locks,public.balance_audit_log,public.disputes,
public.insurance_claims TO service_role;
-- Existing definer RPCs can still bypass table grants: root inventory/caller replacements mandatory.