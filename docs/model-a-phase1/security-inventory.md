# SECURITY DEFINER inventory — November 12, 2026

Inspected 261 public functions; 204 SECURITY DEFINER functions. Full definitions and hashes accompany this inventory. Read-only static review; no exploit writes. Public-schema scope only; managed/system schemas are outside application scope.

## Prioritized financial/delivery findings

### `allocate_payout_to_orders(_user_id uuid, _amount_cents integer, _completed_at timestamp with time zone)`
- EXECUTE: anonymous=True; authenticated=True.
- Unrestricted financial/service mutation; restrict entry point and authorize trusted caller.

### `apply_hold_recovery(_user_id uuid, _gross_cents bigint, _source text, _reference_id text)`
- EXECUTE: anonymous=True; authenticated=True.
- Unrestricted financial/service mutation; restrict entry point and authorize trusted caller.

### `complete_payout(_id uuid, _transfer_id text)`
- EXECUTE: anonymous=True; authenticated=True.
- Unrestricted financial/service mutation; restrict entry point and authorize trusted caller.

### `fail_payout(_id uuid, _reason text)`
- EXECUTE: anonymous=True; authenticated=True.
- Unrestricted financial/service mutation; restrict entry point and authorize trusted caller.

### `set_order_shipping_status(_order_id uuid, _status shipping_status, _source text, _tracking_status text, _location text, _message text, _raw jsonb)`
- EXECUTE: anonymous=True; authenticated=True.
- Unrestricted financial/service mutation; restrict entry point and authorize trusted caller.

### `enforce_late_shipments()`
- EXECUTE: anonymous=True; authenticated=True.
- Unrestricted financial/service mutation; restrict entry point and authorize trusted caller.

### `record_buyer_risk_signal(_user_id uuid, _kind text, _ref_table text, _ref_id uuid, _seller_id uuid, _metadata jsonb)`
- EXECUTE: anonymous=True; authenticated=True.
- Unrestricted financial/service mutation; restrict entry point and authorize trusted caller.

### `run_financial_reconciliation(_since timestamp with time zone)`
- EXECUTE: anonymous=True; authenticated=True.
- Unrestricted financial/service mutation; restrict entry point and authorize trusted caller.

### `sweep_stuck_auctions()`
- EXECUTE: anonymous=True; authenticated=True.
- Unrestricted financial/service mutation; restrict entry point and authorize trusted caller.

### `lock_order_funds(_order_id uuid, _reason text, _notes text)`
- EXECUTE: anonymous=True; authenticated=True.
- Unrestricted financial/service mutation; restrict entry point and authorize trusted caller.

### `release_order_funds(_order_id uuid, _reason text)`
- EXECUTE: anonymous=True; authenticated=True.
- Unrestricted financial/service mutation; restrict entry point and authorize trusted caller.

### `log_account_event(_subject_user_id uuid, _event_type audit_event_type, _summary text, _severity audit_severity, _details jsonb, _actor_user_id uuid, _order_id uuid, _stream_id uuid, _payment_intent_id text, _dispute_id uuid, _payout_id uuid, _report_id uuid, _evidence_id uuid)`
- EXECUTE: anonymous=True; authenticated=True.
- Unrestricted financial/service mutation; restrict entry point and authorize trusted caller.

### `log_platform_revenue(_kind platform_revenue_kind, _amount_cents bigint, _seller_id uuid, _buyer_id uuid, _order_id uuid, _stripe_pi text, _stripe_charge text, _stripe_event text, _notes text, _meta jsonb)`
- EXECUTE: anonymous=True; authenticated=True.
- Unrestricted financial/service mutation; restrict entry point and authorize trusted caller.

### `recalc_seller_trust(_user_id uuid)`
- EXECUTE: anonymous=True; authenticated=True.
- Unrestricted financial/service mutation; restrict entry point and authorize trusted caller.

### `compute_seller_payable(_user_id uuid)`
- EXECUTE: anonymous=True; authenticated=True.
- Unrestricted financial/service mutation; restrict entry point and authorize trusted caller.

### `claim_break_slots(_stream_id uuid, _slot_numbers integer[])`
- EXECUTE: anonymous=False; authenticated=True.
- Authenticated buyer can create nonzero order as paid without a verified charge. Reserve slots unpaid; settle only from verified provider evidence.

### `mark_order_packed(_order_id uuid)`
- EXECUTE: anonymous=True; authenticated=True.
- NULL auth.uid() bypasses v_seller <> auth.uid(); subsequent NOT NULL audit absent. Anonymous preparation mutation possible.

### `mark_order_ready(_order_id uuid)`
- EXECUTE: anonymous=True; authenticated=True.
- Same NULL-comparison bypass as packed.

### `register_shipping_scan(_code text, _kind text)`
- EXECUTE: anonymous=True; authenticated=True.
- No sign-in guard; NULL ownership comparison bypass. NOT NULL scanned_by may rollback, but cannot rely on it; also leaks match state.

### `apply_ai_shipment_scan(_code text, _kind text, _suggested_status text, _carrier text, _confidence numeric, _metadata jsonb)`
- EXECUTE: anonymous=True; authenticated=True.
- Seller supplies delivered suggestion; sets delivered_at without carrier verification. Ownership checked, evidence not trusted.

### `finalize_auction_round(_stream_id uuid)`
- EXECUTE: anonymous=True; authenticated=True.
- NULL boolean condition can bypass auth for no-bidder cases; seller/winner can finalize before expiry; add explicit caller and timer validation.

### `rearm_next_round(_stream_id uuid)`
- EXECUTE: anonymous=True; authenticated=True.
- Treats NULL auth.uid as system; anonymous callers can reset a live round.

### `record_shipping_adjustment(_order_id uuid, _type text, _cost_cents integer, _notes text)`
- EXECUTE: anonymous=True; authenticated=True.
- Authenticated caller supplies arbitrary order/cost; no order ownership/provider evidence. Existing service caller lacks auth.uid and errors; requires new service signature.

### `request_payout(_amount_cents integer)`
- EXECUTE: anonymous=True; authenticated=True.
- Self-authorized/advisory-locked but different from server insert path; NULL payable comparison and inconsistent balances.

### `append_dispute_message(_dispute_id uuid, _body text, _username text)`
- EXECUTE: anonymous=True; authenticated=True.
- Nullable reported_user_id can turn negative ownership condition into NULL and allow nonparticipant message.

## Other findings / corrections

- `log_platform_revenue` and `log_account_event` can fabricate authoritative records; source keys/actor fields are caller supplied. `log_audit_event` is public telemetry and can impersonate event semantics, though actor UUID comes from session; distinguish telemetry from financial evidence.
- `run_platform_reconciliation` is already denied to anonymous/authenticated users (the earlier conceptual call graph did not imply public exposure). `sweep_stuck_auctions` is exposed and calls protected reconciliations indirectly.
- `clear_hold_admin`, admin trust overrides and owner payout/read functions have actual role checks: `has_role` uses EXISTS and returns false for NULL. Do not label all definer functions vulnerable merely because EXECUTE is granted.
- Trigger-returning functions are not ordinary callable RPCs; direct SELECT raises a trigger-context error. Removing their public EXECUTE is hygiene, not proof of an exploitable endpoint. Audit the table write paths that invoke them.
- Profile/order definer protection functions are owned by postgres, so their `current_user` bypass evaluates as privileged. Profile protection also omits balance_cents/payout_hold. Orders INSERT policy only binds buyer_id; paid/financial columns need a service-only gate.
- `recalc_seller_trust` uses absent `dispute_lifecycle` labels resolved_seller/closed_no_action and absent insurance_claim_status reimbursed; actual insurance_status reimbursed DOES exist. Correct only the relevant enums, not all reimbursed usage.
- PostgreSQL request_payout RPC already uses an advisory lock and rejects in-flight requests; the server INSERT path does not use it. Earlier “no locking” concern applies to divergent paths, not this RPC itself.
- `award_credits` allows user-selected credit amounts; `record_reward_progress` allows fabricated readiness feeding rewards. Digital credits are not Stripe money, but need a separate reward-authority audit before redemption. `grant_user_xp` already restricted.

## Every SECURITY DEFINER function

| Function/signature | Anonymous | Authenticated | Classification | Definition SHA-256 |
|---|---|---|---|---|
| `_assert_owner()` | True | True | Other application function; no direct Stripe/delivery mutation identified | `dbbd0184e58a739c` |
| `_merge_identity_refs(_survivor uuid, _victim uuid)` | False | False | Other application function; no direct Stripe/delivery mutation identified | `f49f9b5f6cf56ea9` |
| `accept_required_legal_documents(_version text, _user_agent text)` | False | True | Other application function; no direct Stripe/delivery mutation identified | `6ae2b51483697e1c` |
| `accept_seller_agreement(_version text, _user_agent text)` | False | True | Other application function; no direct Stripe/delivery mutation identified | `774554b9173ff4a4` |
| `add_stream_minutes(_user_id uuid, _minutes integer)` | False | True | Other application function; no direct Stripe/delivery mutation identified | `d38c5c786951688d` |
| `admin_apply_buyer_restriction(_user_id uuid, _kind text, _reason text, _cents_limit integer, _expires_at timestamp with time zone)` | True | True | Other application function; no direct Stripe/delivery mutation identified | `4ab419e12ae0a471` |
| `admin_assign_role(_target_user uuid, _role app_role)` | False | True | Other application function; no direct Stripe/delivery mutation identified | `b532c71052d98590` |
| `admin_ban_buyer(_buyer uuid, _notes text)` | False | True | Other application function; no direct Stripe/delivery mutation identified | `731c976aad67e245` |
| `admin_clear_buyer_restriction(_restriction_id uuid)` | True | True | Other application function; no direct Stripe/delivery mutation identified | `29fe2ef61b2a45b5` |
| `admin_extend_buyer_restriction(_buyer uuid, _days integer, _notes text)` | False | True | Other application function; no direct Stripe/delivery mutation identified | `9f207978d6c281a6` |
| `admin_force_rearm(_stream_id uuid)` | True | True | Other application function; no direct Stripe/delivery mutation identified | `b8d6a083dab97b32` |
| `admin_force_seller_reaccept(_target_user uuid, _reason text)` | False | True | Other application function; no direct Stripe/delivery mutation identified | `b222f21924f58403` |
| `admin_get_signup_stats()` | False | True | Other application function; no direct Stripe/delivery mutation identified | `5fd814a3a019d32d` |
| `admin_identity_health()` | False | True | Other application function; no direct Stripe/delivery mutation identified | `181928a8b203066b` |
| `admin_list_audit_logs(_limit integer, _action_filter text)` | False | True | Other application function; no direct Stripe/delivery mutation identified | `db659432b63179b1` |
| `admin_list_integrity_alerts(_limit integer, _only_unresolved boolean)` | True | True | Other application function; no direct Stripe/delivery mutation identified | `e95e1b5d979cf6bf` |
| `admin_list_platform_revenue(_limit integer, _offset integer, _kind platform_revenue_kind)` | True | True | Financial/delivery related — reviewed; retain caller/role scope | `a74b8e021f45e66c` |
| `admin_list_recent_signups(_limit integer)` | False | True | Other application function; no direct Stripe/delivery mutation identified | `6e931c03ce9f3298` |
| `admin_list_verification_requests(_limit integer)` | False | True | Other application function; no direct Stripe/delivery mutation identified | `9253d68c0dcdea65` |
| `admin_merge_identities(_actor uuid, _survivor uuid, _victims uuid[], _reason text)` | True | True | Other application function; no direct Stripe/delivery mutation identified | `a9321dce563d7987` |
| `admin_override_trust(_user_id uuid, _instant_pct integer, _frozen boolean, _reason text)` | True | True | Financial/delivery related — reviewed; retain caller/role scope | `bf8180c18f372fa5` |
| `admin_personal_sales_summary(_since timestamp with time zone, _until timestamp with time zone)` | True | True | Financial/delivery related — reviewed; retain caller/role scope | `6e6a123e2364cace` |
| `admin_recanonicalize_identity(_actor uuid, _id uuid, _new_fingerprint text, _new_language text, _reason text)` | True | True | Other application function; no direct Stripe/delivery mutation identified | `f30c25ca9b451c31` |
| `admin_remove_role(_target_user uuid, _role app_role)` | False | True | Other application function; no direct Stripe/delivery mutation identified | `7a4cc3888bff7965` |
| `admin_replay_finalize(_stream_id uuid)` | True | True | Financial/delivery related — reviewed; retain caller/role scope | `eea6d72fde31bc9b` |
| `admin_reset_seller_trust(_user_id uuid, _reason text)` | True | True | Financial/delivery related — reviewed; retain caller/role scope | `23b1674b5b050389` |
| `admin_resolve_integrity_alert(_alert_id uuid)` | True | True | Other application function; no direct Stripe/delivery mutation identified | `70f1764386c1849a` |
| `admin_revenue_by_period(_bucket text, _since timestamp with time zone, _until timestamp with time zone)` | True | True | Financial/delivery related — reviewed; retain caller/role scope | `2985dc7ba63f3b83` |
| `admin_revenue_by_seller(_since timestamp with time zone, _until timestamp with time zone, _limit integer)` | True | True | Financial/delivery related — reviewed; retain caller/role scope | `9d190faea40eb3c9` |
| `admin_revenue_by_stream(_since timestamp with time zone, _until timestamp with time zone, _limit integer)` | True | True | Financial/delivery related — reviewed; retain caller/role scope | `8b31878c45e7df3f` |
| `admin_revenue_summary(_since timestamp with time zone)` | True | True | Financial/delivery related — reviewed; retain caller/role scope | `80c6372ad0916d1d` |
| `admin_run_financial_reconciliation(_since timestamp with time zone)` | True | True | Financial/delivery related — reviewed; retain caller/role scope | `a14fbe1c5d698c0c` |
| `admin_set_verification_status(_target_user uuid, _status text, _reason text)` | False | True | Other application function; no direct Stripe/delivery mutation identified | `2ddb1ba377fbf603` |
| `admin_shipping_margin(_since timestamp with time zone, _until timestamp with time zone)` | True | True | Financial/delivery related — reviewed; retain caller/role scope | `f30d5f675b3a0f21` |
| `admin_waive_buyer_restriction(_buyer uuid, _notes text)` | False | True | Other application function; no direct Stripe/delivery mutation identified | `8086888f1c2df2ea` |
| `allocate_payout_to_orders(_user_id uuid, _amount_cents integer, _completed_at timestamp with time zone)` | True | True | Finding — see above | `f1c472d7eee217b6` |
| `append_dispute_message(_dispute_id uuid, _body text, _username text)` | True | True | Finding — see above | `903ead13b327037d` |
| `apply_ai_shipment_scan(_code text, _kind text, _suggested_status text, _carrier text, _confidence numeric, _metadata jsonb)` | True | True | Finding — see above | `f8e6a17d46436db4` |
| `apply_hold_recovery(_user_id uuid, _gross_cents bigint, _source text, _reference_id text)` | True | True | Finding — see above | `e6cdaed6362e8c62` |
| `apply_live_stream_safety(_stream_id uuid)` | False | True | Other application function; no direct Stripe/delivery mutation identified | `d9537101c9f5477e` |
| `apply_stream_shipping_cap()` | True | True | Trigger helper; audit table path | `e829837667feb52a` |
| `arena_feed_comment_count()` | True | True | Trigger helper; audit table path | `9a5ef97ec0e839d8` |
| `arena_feed_like_count()` | True | True | Trigger helper; audit table path | `62555e10118da82e` |
| `assert_order_payout_consistent()` | True | True | Trigger helper; audit table path | `ae6166b78ebbd305` |
| `assert_payout_within_available_balance()` | True | True | Trigger helper; audit table path | `edbdffff0a3717e2` |
| `assert_platform_revenue_traceable()` | True | True | Trigger helper; audit table path | `6d3e18ee0e7f2147` |
| `assert_seller_verified_for_payout()` | True | True | Trigger helper; audit table path | `7e482d45b522a94d` |
| `audit_live_stream_change()` | True | True | Trigger helper; audit table path | `02d4335e486da9c9` |
| `audit_order_payment_change()` | True | True | Trigger helper; audit table path | `e16ee4911f01325e` |
| `auto_open_balance_hold()` | True | True | Trigger helper; audit table path | `317b446a0af4e26e` |
| `auto_unblock_on_order_cancel()` | True | True | Trigger helper; audit table path | `0699daf23688187d` |
| `award_credits(_amount bigint, _source text, _ref_id text, _description text)` | False | True | Other application function; no direct Stripe/delivery mutation identified | `e87f152d157e3ec2` |
| `award_xp(_amount integer, _reason text, _ref_id text)` | True | True | Other application function; no direct Stripe/delivery mutation identified | `440514370f4474fc` |
| `bump_combo_streak(_stream_id uuid)` | True | True | Other application function; no direct Stripe/delivery mutation identified | `a5b7ff6fa3885e67` |
| `bump_community_member_count()` | True | True | Trigger helper; audit table path | `7d12876902f6e034` |
| `bump_community_post_count()` | True | True | Trigger helper; audit table path | `86527c9030fca891` |
| `bump_listing_sold_on_insert_paid()` | False | False | Trigger helper; audit table path | `aefc90e5eb38abd5` |
| `bump_listing_sold_on_paid()` | False | False | Trigger helper; audit table path | `d57243d4262779c6` |
| `bump_login_streak()` | False | True | Other application function; no direct Stripe/delivery mutation identified | `796d72d93de258b4` |
| `bump_post_comment_count()` | True | True | Trigger helper; audit table path | `4631f5b985d9c7d9` |
| `bump_post_like_count()` | True | True | Trigger helper; audit table path | `99c9d307bb4e7734` |
| `bump_quest_progress(_slug text, _delta integer)` | True | True | Other application function; no direct Stripe/delivery mutation identified | `74bdf35403003ef2` |
| `buyer_active_restrictions(_user_id uuid)` | True | True | Other application function; no direct Stripe/delivery mutation identified | `688ee023ac6ca0d3` |
| `buyer_can_purchase(_user_id uuid, _amount_cents integer)` | True | True | Other application function; no direct Stripe/delivery mutation identified | `ccbb6f5437069c23` |
| `can_see_mod_chat(_stream_id uuid)` | True | True | Other application function; no direct Stripe/delivery mutation identified | `35740b75e5580834` |
| `can_view_story(_story_owner uuid, _visibility text, _viewer uuid)` | False | True | Other application function; no direct Stripe/delivery mutation identified | `678ad188089d269d` |
| `can_view_vault(_owner uuid, _visibility text, _viewer uuid)` | False | True | Other application function; no direct Stripe/delivery mutation identified | `5ac59ebaa57b5a8f` |
| `can_view_vault_owner(_owner uuid, _viewer uuid)` | False | True | Other application function; no direct Stripe/delivery mutation identified | `ac473307ed56f774` |
| `change_shop_name(_new_name text)` | False | True | Financial/delivery related — reviewed; retain caller/role scope | `ec7601aa68bbb3b4` |
| `chat_messages_validate()` | False | False | Trigger helper; audit table path | `b3928b9903817d1b` |
| `check_combo_achievements()` | True | True | Trigger helper; audit table path | `8f8039563545a97d` |
| `check_shipping_achievements()` | True | True | Trigger helper; audit table path | `cb3497ffc52d7f89` |
| `claim_break_slots(_stream_id uuid, _slot_numbers integer[])` | False | True | Finding — see above | `67328e7cbd91f6bf` |
| `claim_daily_login()` | True | True | Other application function; no direct Stripe/delivery mutation identified | `2a89f1a863ecc0a5` |
| `claim_reward(_def_slug text, _context_key text, _context_label text)` | False | True | Other application function; no direct Stripe/delivery mutation identified | `79d5bf5dcd82a610` |
| `cleanup_prebid_on_vault_sold()` | True | True | Trigger helper; audit table path | `b40856ad2edead58` |
| `clear_hold_admin(_hold_id uuid, _override boolean, _notes text)` | True | True | Financial/delivery related — reviewed; retain caller/role scope | `1150fea960112132` |
| `collab_invite_apply_accept()` | False | False | Trigger helper; audit table path | `56dcca108a263cc2` |
| `collab_invite_promote_to_mod()` | True | True | Trigger helper; audit table path | `3d5168a79166d52b` |
| `collab_invite_verified_check()` | False | False | Trigger helper; audit table path | `d586a1666bda507c` |
| `collab_join_request_apply_accept()` | False | False | Trigger helper; audit table path | `0459c40aad837361` |
| `collab_join_verified_check()` | False | False | Trigger helper; audit table path | `4d9157c1d8171a9a` |
| `complete_payout(_id uuid, _transfer_id text)` | True | True | Finding — see above | `b1bf603a41468fb8` |
| `compute_buyer_fee_cents(_buyer_id uuid, _stream_id uuid, _default_cents integer, _threshold integer)` | True | True | Financial/delivery related — reviewed; retain caller/role scope | `bf3f69273677de54` |
| `compute_platform_available()` | True | True | Financial/delivery related — reviewed; retain caller/role scope | `87cba3eaf86508a6` |
| `compute_seller_payable(_user_id uuid)` | True | True | Finding — see above | `490c0f5a7213af71` |
| `confirm_live_stream_active(_stream_id uuid)` | False | True | Other application function; no direct Stripe/delivery mutation identified | `553e5cdc41683f9c` |
| `create_default_notification_prefs()` | True | True | Trigger helper; audit table path | `82c45d1348b45030` |
| `create_giveaway_order(_giveaway_id uuid)` | False | True | Financial/delivery related — reviewed; retain caller/role scope | `957ce4428af04a51` |
| `delete_email(queue_name text, message_id bigint)` | True | True | Other application function; no direct Stripe/delivery mutation identified | `7960f07eef1600b4` |
| `direct_messages_validate()` | False | False | Trigger helper; audit table path | `77b97772a484a5ad` |
| `email_queue_dispatch()` | True | True | Other application function; no direct Stripe/delivery mutation identified | `480760117c68aff9` |
| `email_queue_wake()` | True | True | Trigger helper; audit table path | `dde8d4fee2296387` |
| `enforce_late_shipments()` | True | True | Finding — see above | `898d925658274887` |
| `enqueue_email(queue_name text, payload jsonb)` | True | True | Other application function; no direct Stripe/delivery mutation identified | `f655d5993a7af13b` |
| `error_logs_validate()` | False | False | Trigger helper; audit table path | `cfa84c28cebde2d4` |
| `extend_flex_live_session(_stream_id uuid)` | False | True | Other application function; no direct Stripe/delivery mutation identified | `70d714dd2ee6f9ab` |
| `fail_payout(_id uuid, _reason text)` | True | True | Finding — see above | `4bcc3862a3de4c46` |
| `finalize_auction_round(_stream_id uuid)` | True | True | Finding — see above | `9eb69d0b71f7dae6` |
| `get_buyer_completed_count(_user uuid)` | False | True | Financial/delivery related — reviewed; retain caller/role scope | `94cc284511d950b4` |
| `get_buyer_private_insights(_user_id uuid)` | False | True | Financial/delivery related — reviewed; retain caller/role scope | `3d1d46e8534a962f` |
| `get_buyer_public_badges(_user_id uuid)` | True | True | Other application function; no direct Stripe/delivery mutation identified | `b042ab713d3a611e` |
| `get_buyer_reputation(_user_id uuid)` | True | True | Financial/delivery related — reviewed; retain caller/role scope | `1ecafd2655b1c440` |
| `get_notify_targets(_user_ids uuid[], _category text)` | True | True | Financial/delivery related — reviewed; retain caller/role scope | `dea5b4272925ee7c` |
| `get_seller_badges(_seller_id uuid)` | True | True | Other application function; no direct Stripe/delivery mutation identified | `5f1e77f4798954b3` |
| `get_seller_completed_count(_user uuid)` | False | True | Financial/delivery related — reviewed; retain caller/role scope | `e5079241c026c390` |
| `get_seller_recent_reviews(_seller_id uuid, _limit integer)` | True | True | Other application function; no direct Stripe/delivery mutation identified | `fb8430aa4faee639` |
| `get_seller_response_badges(_seller_id uuid)` | True | True | Other application function; no direct Stripe/delivery mutation identified | `97823c5d60658539` |
| `get_seller_shipping_cap(_user uuid)` | False | True | Other application function; no direct Stripe/delivery mutation identified | `7182ad480a98cd63` |
| `get_seller_stats(_seller_id uuid)` | True | True | Financial/delivery related — reviewed; retain caller/role scope | `8eefa27e1ad31d0e` |
| `get_winner_shipping(p_stream_id uuid, p_winner_id uuid)` | False | True | Other application function; no direct Stripe/delivery mutation identified | `21ff7dafa84b7312` |
| `grant_user_xp(_user_id uuid, _amount integer, _reason text, _ref_id text)` | False | False | Other application function; no direct Stripe/delivery mutation identified | `746bfae662a76730` |
| `handle_new_user()` | False | False | Trigger helper; audit table path | `3b1bf239a53fc3e8` |
| `has_active_hold(_user_id uuid)` | True | True | Financial/delivery related — reviewed; retain caller/role scope | `06f2335bd1041061` |
| `has_role(_user_id uuid, _role app_role)` | False | True | Other application function; no direct Stripe/delivery mutation identified | `e4a280ca404f7cff` |
| `is_bid_blocked(_stream_id uuid, _user_id uuid)` | True | True | Other application function; no direct Stripe/delivery mutation identified | `6e22b937057cf5c2` |
| `is_bid_restricted(_user uuid)` | True | True | Other application function; no direct Stripe/delivery mutation identified | `5cf112efb63b1b83` |
| `is_in_quiet_hours(_user_id uuid)` | False | True | Other application function; no direct Stripe/delivery mutation identified | `619d50115c33072f` |
| `is_seller_verified(_user_id uuid)` | True | True | Financial/delivery related — reviewed; retain caller/role scope | `ccd9db87eeeb8052` |
| `is_stream_staff(_stream_id uuid, _user uuid)` | False | True | Other application function; no direct Stripe/delivery mutation identified | `4d37a1ffbe7f9380` |
| `is_user_suspended(_user_id uuid)` | False | True | Other application function; no direct Stripe/delivery mutation identified | `c26aab7e7cb8de51` |
| `list_followers(_user uuid)` | True | True | Other application function; no direct Stripe/delivery mutation identified | `79f6bf85e682f670` |
| `list_following(_user uuid)` | True | True | Other application function; no direct Stripe/delivery mutation identified | `bad94b33a6764266` |
| `live_streams_restrict_bidder_update()` | False | False | Trigger helper; audit table path | `737d26b92335eaa2` |
| `lock_order_funds(_order_id uuid, _reason text, _notes text)` | True | True | Finding — see above | `857925fd56be7726` |
| `log_account_event(_subject_user_id uuid, _event_type audit_event_type, _summary text, _severity audit_severity, _details jsonb, _actor_user_id uuid, _order_id uuid, _stream_id uuid, _payment_intent_id text, _dispute_id uuid, _payout_id uuid, _report_id uuid, _evidence_id uuid)` | True | True | Finding — see above | `2f3ae7fa7b2fabfa` |
| `log_admin_action(_action text, _target_table text, _target_id uuid, _subject_user_id uuid, _before jsonb, _after jsonb, _reason text)` | True | True | Other application function; no direct Stripe/delivery mutation identified | `4da549a73ef28dd6` |
| `log_audit_event(_action text, _target_type text, _target_id uuid, _meta jsonb, _ip_hash text, _user_agent text)` | True | True | Other application function; no direct Stripe/delivery mutation identified | `6abd95cac617d2ad` |
| `log_platform_revenue(_kind platform_revenue_kind, _amount_cents bigint, _seller_id uuid, _buyer_id uuid, _order_id uuid, _stripe_pi text, _stripe_charge text, _stripe_event text, _notes text, _meta jsonb)` | True | True | Finding — see above | `f735d3abe9d9fac9` |
| `mark_order_packed(_order_id uuid)` | True | True | Finding — see above | `32b6ff4df894fd02` |
| `mark_order_ready(_order_id uuid)` | True | True | Finding — see above | `03e04782738b8b3c` |
| `mark_vault_card_sold_on_queue_sold()` | True | True | Trigger helper; audit table path | `e252f976daed4e53` |
| `match_wishlist_on_listing()` | True | True | Trigger helper; audit table path | `bc1e6b502bf09831` |
| `match_wishlist_on_trade()` | True | True | Trigger helper; audit table path | `b87e39c4031fe7de` |
| `move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)` | True | True | Other application function; no direct Stripe/delivery mutation identified | `5ee424ecac5bb66c` |
| `notifications_validate_insert()` | False | False | Trigger helper; audit table path | `7ec49a122a1eb207` |
| `notify_buyer_on_prep_change()` | True | True | Trigger helper; audit table path | `b055ee1c7110b398` |
| `notify_followers_on_auction_start()` | True | True | Trigger helper; audit table path | `28a3758cf55d9406` |
| `notify_followers_on_live()` | True | True | Trigger helper; audit table path | `8f1a90fd02d74096` |
| `notify_followers_on_new_listing()` | True | True | Trigger helper; audit table path | `3472a596f720a503` |
| `notify_listing_outbid()` | True | True | Trigger helper; audit table path | `93a2820d2ac2c7a7` |
| `notify_new_follower()` | True | True | Trigger helper; audit table path | `ea95b1ee516c1bdb` |
| `notify_order_status()` | True | True | Trigger helper; audit table path | `abf673ad6f4a0b74` |
| `notify_user(_user_id uuid, _type text, _category text, _body text, _link text)` | True | True | Other application function; no direct Stripe/delivery mutation identified | `e35eb8db016c2609` |
| `open_daily_crate()` | True | True | Other application function; no direct Stripe/delivery mutation identified | `b8f185f1d87685ca` |
| `orders_protect_payouts()` | True | True | Trigger helper; audit table path | `2c5a4c3b3cc009e1` |
| `orders_restrict_client_update()` | False | False | Trigger helper; audit table path | `515aa71bc999e2c6` |
| `perf_metrics_validate()` | False | False | Trigger helper; audit table path | `b0e8f078032b8312` |
| `perf_slow_routes(_minutes integer, _limit integer)` | True | True | Other application function; no direct Stripe/delivery mutation identified | `f412c92ed3809cb9` |
| `perf_summary(_minutes integer)` | True | True | Other application function; no direct Stripe/delivery mutation identified | `eb6ef36a880b7f96` |
| `place_listing_bid(_listing_id uuid, _amount numeric)` | False | True | Financial/delivery related — reviewed; retain caller/role scope | `4707a32ed03dc9f4` |
| `place_live_bid(_stream_id uuid, _amount numeric)` | True | True | Financial/delivery related — reviewed; retain caller/role scope | `8333e6748951d337` |
| `prevent_owner_suspension()` | False | False | Trigger helper; audit table path | `a349c9df66703c23` |
| `prevent_profile_privilege_escalation()` | False | False | Trigger helper; audit table path | `6380a1670ec31fbc` |
| `protect_owner_role()` | False | False | Trigger helper; audit table path | `5d57a81d84ff1e87` |
| `public_profile_by_username(_username text)` | True | True | Other application function; no direct Stripe/delivery mutation identified | `26afe4bb781df037` |
| `public_profiles_by_ids(_ids uuid[])` | True | True | Other application function; no direct Stripe/delivery mutation identified | `a6b8e53a173439ca` |
| `purge_old_notifications()` | False | True | Other application function; no direct Stripe/delivery mutation identified | `d0dd8f3ed054b393` |
| `purge_old_perf_data()` | True | True | Other application function; no direct Stripe/delivery mutation identified | `4ebd0e7977869928` |
| `rate_limit_card_scan(_user_id uuid)` | True | True | Other application function; no direct Stripe/delivery mutation identified | `4c29d59fc55fc54f` |
| `read_email_batch(queue_name text, batch_size integer, vt integer)` | True | True | Other application function; no direct Stripe/delivery mutation identified | `5e4bce254c1b8991` |
| `rearm_next_round(_stream_id uuid)` | True | True | Finding — see above | `9563c323cea82325` |
| `recalc_seller_trust(_user_id uuid)` | True | True | Finding — see above | `d4335d62e8cef116` |
| `reconcile_auction_states()` | False | False | Financial/delivery related — reviewed; retain caller/role scope | `c53a2ca5f44eda90` |
| `reconcile_sold_items()` | False | False | Financial/delivery related — reviewed; retain caller/role scope | `b5814e0911048c0c` |
| `reconcile_stale_payments()` | False | False | Financial/delivery related — reviewed; retain caller/role scope | `66a4dbef3754f1cd` |
| `record_buyer_risk_signal(_user_id uuid, _kind text, _ref_table text, _ref_id uuid, _seller_id uuid, _metadata jsonb)` | True | True | Finding — see above | `9ba8f61c26fe102a` |
| `record_collection_activity(_user_id uuid)` | True | True | Other application function; no direct Stripe/delivery mutation identified | `39bf207e23c689ce` |
| `record_reward_progress(_def_slug text, _progress integer, _target integer, _context_key text, _context_label text)` | False | True | Other application function; no direct Stripe/delivery mutation identified | `d85f94fef5dcacc8` |
| `record_shipping_adjustment(_order_id uuid, _type text, _cost_cents integer, _notes text)` | True | True | Finding — see above | `8e763eaf4045ea78` |
| `record_unpaid_auction_win(_buyer_id uuid)` | False | False | Financial/delivery related — reviewed; retain caller/role scope | `19a92d0610df1adb` |
| `refresh_seller_shipping_analytics()` | True | True | Other application function; no direct Stripe/delivery mutation identified | `adf353c553857d3e` |
| `register_shipping_scan(_code text, _kind text)` | True | True | Finding — see above | `94410587718accad` |
| `release_order_funds(_order_id uuid, _reason text)` | True | True | Finding — see above | `c7bc1422c181b9a9` |
| `request_payout(_amount_cents integer)` | True | True | Finding — see above | `b7066c46f5c53876` |
| `request_platform_payout(_amount_cents bigint, _destination text, _notes text)` | True | True | Financial/delivery related — reviewed; retain caller/role scope | `012eb7cde17c8379` |
| `request_verification(_kind text, _note text)` | False | True | Other application function; no direct Stripe/delivery mutation identified | `0cd2402a6341db3a` |
| `run_financial_reconciliation(_since timestamp with time zone)` | True | True | Finding — see above | `0d6a1570785da71c` |
| `run_platform_reconciliation()` | False | False | Financial/delivery related — reviewed; retain caller/role scope | `e393269562bcd2c8` |
| `search_public_profiles(_query text, _limit integer)` | True | True | Other application function; no direct Stripe/delivery mutation identified | `0983cd58bb97a97a` |
| `search_users(_query text, _limit integer)` | True | True | Other application function; no direct Stripe/delivery mutation identified | `48d6a3e73365619d` |
| `seller_country(_seller_id uuid)` | True | True | Other application function; no direct Stripe/delivery mutation identified | `707943be704f174c` |
| `set_order_auction_number()` | True | True | Trigger helper; audit table path | `7878e63bd16593e5` |
| `set_order_shipping_status(_order_id uuid, _status shipping_status, _source text, _tracking_status text, _location text, _message text, _raw jsonb)` | True | True | Finding — see above | `a48de05800f4f7fd` |
| `spawn_next_recurrence()` | True | True | Trigger helper; audit table path | `fe13ab4adcb7c48e` |
| `spin_collection_wheel(_context_key text, _context_label text)` | True | True | Other application function; no direct Stripe/delivery mutation identified | `caf0ac25ac05daea` |
| `spin_wheels_restrict_viewer_update()` | False | False | Trigger helper; audit table path | `78acc9ff43d229f6` |
| `stream_user_bans_protect_admins()` | False | False | Trigger helper; audit table path | `1196d7f0acc9fc3e` |
| `suggested_users(_limit integer)` | True | True | Other application function; no direct Stripe/delivery mutation identified | `30efb366d442d9e4` |
| `support_message_notify()` | False | False | Trigger helper; audit table path | `ac17a55dd3aa67bc` |
| `sweep_inactive_streams()` | True | True | Other application function; no direct Stripe/delivery mutation identified | `b8b89159f9550ff0` |
| `sweep_stuck_auctions()` | True | True | Finding — see above | `c5387aad0a36c4d7` |
| `sync_vault_listing_link()` | True | True | Trigger helper; audit table path | `4c092dd579c2a454` |
| `touch_live_stream_activity(_stream_id uuid, _activity_type text)` | False | True | Other application function; no direct Stripe/delivery mutation identified | `b8214710eb177f4a` |
| `track_dispute_audit()` | True | True | Trigger helper; audit table path | `7307a7857d1e8c7a` |
| `track_evidence_review()` | True | True | Trigger helper; audit table path | `d7f0e6d6ff67f48d` |
| `track_order_cancellation()` | True | True | Trigger helper; audit table path | `884a196e93caf8c6` |
| `track_payout_failure()` | True | True | Trigger helper; audit table path | `a40ac860e51be97f` |
| `track_profile_history()` | True | True | Trigger helper; audit table path | `93724eaacbc7bd9b` |
| `trending_sellers(_limit integer)` | True | True | Financial/delivery related — reviewed; retain caller/role scope | `db9db7c8749e7ba9` |
| `tutorials_for_route(_path text)` | True | True | Other application function; no direct Stripe/delivery mutation identified | `21bfdd87b8dafbb4` |
| `unlock_achievement(_user_id uuid, _slug text)` | True | True | Other application function; no direct Stripe/delivery mutation identified | `60a95a88a93ce471` |
| `user_blocks_protect_admins()` | False | False | Trigger helper; audit table path | `53e4014b70a9033a` |
| `validate_order_inventory()` | False | False | Trigger helper; audit table path | `2c843aa5c0c1bcf8` |
