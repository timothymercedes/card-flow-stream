-- Revoke anon EXECUTE on functions that require an authenticated user
DO $$
DECLARE r record;
DECLARE fn_list text[] := ARRAY[
  'accept_legal_document(text,text,text)',
  'accept_required_legal_documents(text,text)',
  'accept_seller_agreement(text,text)',
  'add_stream_minutes(uuid,integer)',
  'admin_assign_role(uuid,app_role)',
  'admin_force_seller_reaccept(uuid,text)',
  'admin_get_signup_stats()',
  'admin_list_recent_signups(integer)',
  'admin_list_verification_requests(integer)',
  'admin_remove_role(uuid,app_role)',
  'admin_set_verification_status(uuid,text,text)',
  'apply_live_stream_safety(uuid)',
  'bump_login_streak()',
  'claim_break_slots(uuid,integer[])',
  'confirm_live_stream_active(uuid)',
  'create_giveaway_order(uuid)',
  'extend_flex_live_session(uuid)',
  'get_winner_shipping(uuid,uuid)',
  'request_verification(text,text)',
  'touch_live_stream_activity(uuid,text)'
];
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY fn_list LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM anon', fn);
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE 'skip missing %', fn;
    END;
  END LOOP;
END $$;