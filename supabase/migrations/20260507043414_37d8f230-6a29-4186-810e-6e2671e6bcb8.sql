DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'add_stream_minutes(uuid,integer)',
    'bump_listing_sold_on_insert_paid()',
    'bump_listing_sold_on_paid()',
    'collab_invite_apply_accept()',
    'collab_invite_verified_check()',
    'collab_join_request_apply_accept()',
    'collab_join_verified_check()',
    'get_buyer_completed_count(uuid)',
    'get_seller_completed_count(uuid)',
    'get_seller_shipping_cap(uuid)',
    'prevent_owner_suspension()',
    'prevent_profile_privilege_escalation()',
    'protect_owner_role()',
    'purge_old_notifications()',
    'stream_user_bans_protect_admins()',
    'support_message_notify()',
    'user_blocks_protect_admins()',
    'validate_order_inventory()'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM anon, PUBLIC', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', fn);
  END LOOP;
END $$;