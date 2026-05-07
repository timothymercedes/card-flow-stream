
-- 1) Fix mutable search_path
CREATE OR REPLACE FUNCTION public.touch_obs_profile()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- 2) Revoke anon EXECUTE from functions that require authentication anyway
DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'admin_assign_role(uuid,app_role)',
    'admin_remove_role(uuid,app_role)',
    'admin_set_verification_status(uuid,text,text)',
    'admin_force_seller_reaccept(uuid,text)',
    'admin_get_signup_stats()',
    'admin_list_recent_signups(integer)',
    'admin_list_verification_requests(integer)',
    'request_verification(text,text)',
    'accept_legal_document(text,text,text)',
    'accept_required_legal_documents(text,text)',
    'accept_seller_agreement(text,text)',
    'bump_login_streak()',
    'create_giveaway_order(uuid)',
    'claim_break_slots(uuid,integer[])',
    'extend_flex_live_session(uuid)',
    'confirm_live_stream_active(uuid)',
    'touch_live_stream_activity(uuid,text)',
    'add_stream_minutes(uuid,integer)'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM anon', fn);
    EXCEPTION WHEN undefined_function THEN
      NULL;
    END;
  END LOOP;
END $$;
