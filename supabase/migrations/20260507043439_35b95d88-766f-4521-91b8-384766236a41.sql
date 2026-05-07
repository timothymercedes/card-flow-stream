DO $$
DECLARE
  fn text;
  trigger_only text[] := ARRAY[
    'bump_listing_sold_on_insert_paid()',
    'bump_listing_sold_on_paid()',
    'collab_invite_apply_accept()',
    'collab_invite_verified_check()',
    'collab_join_request_apply_accept()',
    'collab_join_verified_check()',
    'prevent_owner_suspension()',
    'prevent_profile_privilege_escalation()',
    'protect_owner_role()',
    'stream_user_bans_protect_admins()',
    'support_message_notify()',
    'user_blocks_protect_admins()',
    'validate_order_inventory()',
    'validate_offer_amount()',
    'validate_shop_name()',
    'set_public_id()',
    'set_updated_at()',
    'touch_obs_profile()',
    'update_stripe_accounts_updated_at()',
    'enforce_shoutout_cap()',
    'live_streams_restrict_bidder_update()',
    'spin_wheels_restrict_viewer_update()',
    'stream_payment_events_validate()',
    'notifications_validate_insert()',
    'handle_new_user()'
  ];
BEGIN
  FOREACH fn IN ARRAY trigger_only LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM anon, authenticated, PUBLIC', fn);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;