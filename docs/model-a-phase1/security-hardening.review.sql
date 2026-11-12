-- REVIEW ONLY / NOT APPLIED. Do not deploy as a standalone migration.
-- Coupled caller updates, isolated database tests and explicit approval required.
-- No row backfill, payment routing, balances, transfer creation or Stripe setting changes.
-- Snapshot definitions/ACLs in function-definitions.json before approved application.

CREATE OR REPLACE FUNCTION public.model_a_assert_service()
RETURNS void LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $guard$
BEGIN
  -- request role is injected by the trusted Data API; never use current_user in a definer.
  IF COALESCE(auth.role(), '') = 'service_role' THEN RETURN; END IF;
  -- Reviewed local maintenance/cron sessions, not arbitrary missing auth.uid().
  IF session_user IN ('postgres','supabase_admin')
     AND NULLIF(current_setting('request.jwt.claims', true),'') IS NULL
     AND NULLIF(current_setting('request.jwt.claim.role', true),'') IS NULL THEN RETURN; END IF;
  RAISE EXCEPTION 'Trusted service operation required' USING ERRCODE = '42501';
END;
$guard$;
REVOKE ALL ON FUNCTION public.model_a_assert_service() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.model_a_assert_service() TO service_role;

REVOKE EXECUTE ON FUNCTION public.allocate_payout_to_orders(_user_id uuid, _amount_cents integer, _completed_at timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_payout_to_orders(_user_id uuid, _amount_cents integer, _completed_at timestamp with time zone) TO service_role;
REVOKE EXECUTE ON FUNCTION public.apply_hold_recovery(_user_id uuid, _gross_cents bigint, _source text, _reference_id text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_hold_recovery(_user_id uuid, _gross_cents bigint, _source text, _reference_id text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.complete_payout(_id uuid, _transfer_id text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_payout(_id uuid, _transfer_id text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.fail_payout(_id uuid, _reason text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_payout(_id uuid, _reason text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.set_order_shipping_status(_order_id uuid, _status shipping_status, _source text, _tracking_status text, _location text, _message text, _raw jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_order_shipping_status(_order_id uuid, _status shipping_status, _source text, _tracking_status text, _location text, _message text, _raw jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.enforce_late_shipments() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_late_shipments() TO service_role;
REVOKE EXECUTE ON FUNCTION public.record_buyer_risk_signal(_user_id uuid, _kind text, _ref_table text, _ref_id uuid, _seller_id uuid, _metadata jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_buyer_risk_signal(_user_id uuid, _kind text, _ref_table text, _ref_id uuid, _seller_id uuid, _metadata jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.run_financial_reconciliation(_since timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_financial_reconciliation(_since timestamp with time zone) TO service_role;
REVOKE EXECUTE ON FUNCTION public.sweep_stuck_auctions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_stuck_auctions() TO service_role;
REVOKE EXECUTE ON FUNCTION public.reconcile_stale_payments() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_stale_payments() TO service_role;
REVOKE EXECUTE ON FUNCTION public.reconcile_auction_states() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_auction_states() TO service_role;
REVOKE EXECUTE ON FUNCTION public.reconcile_sold_items() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_sold_items() TO service_role;
REVOKE EXECUTE ON FUNCTION public.run_platform_reconciliation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_platform_reconciliation() TO service_role;
REVOKE EXECUTE ON FUNCTION public.record_unpaid_auction_win(_buyer_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_unpaid_auction_win(_buyer_id uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.lock_order_funds(_order_id uuid, _reason text, _notes text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lock_order_funds(_order_id uuid, _reason text, _notes text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.release_order_funds(_order_id uuid, _reason text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_order_funds(_order_id uuid, _reason text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.log_account_event(_subject_user_id uuid, _event_type audit_event_type, _summary text, _severity audit_severity, _details jsonb, _actor_user_id uuid, _order_id uuid, _stream_id uuid, _payment_intent_id text, _dispute_id uuid, _payout_id uuid, _report_id uuid, _evidence_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_account_event(_subject_user_id uuid, _event_type audit_event_type, _summary text, _severity audit_severity, _details jsonb, _actor_user_id uuid, _order_id uuid, _stream_id uuid, _payment_intent_id text, _dispute_id uuid, _payout_id uuid, _report_id uuid, _evidence_id uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.log_platform_revenue(_kind platform_revenue_kind, _amount_cents bigint, _seller_id uuid, _buyer_id uuid, _order_id uuid, _stripe_pi text, _stripe_charge text, _stripe_event text, _notes text, _meta jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_platform_revenue(_kind platform_revenue_kind, _amount_cents bigint, _seller_id uuid, _buyer_id uuid, _order_id uuid, _stripe_pi text, _stripe_charge text, _stripe_event text, _notes text, _meta jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.recalc_seller_trust(_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_seller_trust(_user_id uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.compute_seller_payable(_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_seller_payable(_user_id uuid) TO service_role;

-- Internal lock/release/trust/financial-log helpers deliberately receive ACL revocation only.
-- Their reviewed definer trigger/admin parents call them on behalf of authenticated users.
-- Adding a blanket service-JWT guard inside those helpers would break those valid call chains.
-- Harden their entry points and table writes together; no user-controlled bypass flag.

CREATE OR REPLACE FUNCTION public.allocate_payout_to_orders(_user_id uuid, _amount_cents integer, _completed_at timestamp with time zone DEFAULT now())
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  remaining int := _amount_cents;
  r record;
  order_share int;
BEGIN
  PERFORM public.model_a_assert_service();
  FOR r IN
    SELECT id, GREATEST(0, COALESCE(seller_payout_amount,0)*100 - COALESCE(payout_paid_amount_cents,0))::int AS owed
    FROM public.orders
    WHERE seller_id = _user_id
      AND payout_eligible_at <= now()
      AND payout_paid_at IS NULL
      AND payment_status = 'paid'
      AND COALESCE(refunded_amount,0) = 0
    ORDER BY payout_eligible_at ASC
  LOOP
    EXIT WHEN remaining <= 0;
    order_share := LEAST(remaining, r.owed);
    UPDATE public.orders SET
      payout_paid_amount_cents = COALESCE(payout_paid_amount_cents,0) + order_share,
      payout_paid_at = CASE WHEN COALESCE(payout_paid_amount_cents,0) + order_share >= COALESCE(seller_payout_amount,0)*100
                            THEN _completed_at ELSE payout_paid_at END
    WHERE id = r.id;
    remaining := remaining - order_share;
  END LOOP;
END$function$
;

CREATE OR REPLACE FUNCTION public.apply_hold_recovery(_user_id uuid, _gross_cents bigint, _source text DEFAULT 'payout'::text, _reference_id text DEFAULT NULL::text)
 RETURNS hold_recoveries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hold public.account_holds;
  v_owed bigint := 0;
  v_deduct bigint := 0;
  v_net bigint := _gross_cents;
  v_remaining bigint := 0;
  v_rec public.hold_recoveries;
BEGIN
  PERFORM public.model_a_assert_service();
  IF _gross_cents <= 0 THEN
    RAISE EXCEPTION 'gross_cents must be positive';
  END IF;

  SELECT * INTO v_hold FROM public.account_holds
    WHERE user_id = _user_id AND status = 'active'
    FOR UPDATE;

  IF FOUND THEN
    v_owed := v_hold.balance_owed_cents;
    v_deduct := LEAST(v_owed, _gross_cents);
    v_net := _gross_cents - v_deduct;
    v_remaining := v_owed - v_deduct;

    UPDATE public.account_holds
      SET balance_owed_cents = v_remaining
      WHERE id = v_hold.id;
  END IF;

  -- Credit net to the seller balance (deducted portion offsets the negative)
  UPDATE public.profiles
    SET balance_cents = balance_cents + _gross_cents - v_deduct + v_deduct
    WHERE id = _user_id;
  -- Note: the line above credits gross-deduct (net) to balance; the deducted
  -- portion was already accounted as debt in balance_cents, so we add it back
  -- to bring the balance toward zero. Net effect: balance += gross.
  -- If the seller's balance is now >= 0 and a hold is active, auto-clear it.
  IF v_hold.id IS NOT NULL AND v_remaining <= 0 THEN
    UPDATE public.account_holds
      SET status = 'cleared',
          cleared_at = now(),
          notes = COALESCE(notes || E'\n', '') || 'Auto-cleared via recovery'
      WHERE id = v_hold.id;
    UPDATE public.profiles SET payout_hold = false WHERE id = _user_id;
  END IF;

  INSERT INTO public.hold_recoveries
    (user_id, hold_id, source, reference_id, gross_cents, deducted_cents, net_released_cents, remaining_owed_cents)
    VALUES (_user_id, v_hold.id, _source, _reference_id, _gross_cents, v_deduct, v_net, v_remaining)
    RETURNING * INTO v_rec;

  RETURN v_rec;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.complete_payout(_id uuid, _transfer_id text)
 RETURNS payout_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _row public.payout_requests; BEGIN
  PERFORM public.model_a_assert_service();
  UPDATE public.payout_requests SET status='completed', stripe_transfer_id=_transfer_id,
    completed_at=now(), updated_at=now() WHERE id=_id RETURNING * INTO _row;
  RETURN _row;
END $function$
;

CREATE OR REPLACE FUNCTION public.fail_payout(_id uuid, _reason text)
 RETURNS payout_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _row public.payout_requests; BEGIN
  PERFORM public.model_a_assert_service();
  UPDATE public.payout_requests SET status='failed', failure_reason=_reason, updated_at=now()
   WHERE id=_id RETURNING * INTO _row;
  RETURN _row;
END $function$
;

CREATE OR REPLACE FUNCTION public.set_order_shipping_status(_order_id uuid, _status shipping_status, _source text DEFAULT 'system'::text, _tracking_status text DEFAULT NULL::text, _location text DEFAULT NULL::text, _message text DEFAULT NULL::text, _raw jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o public.orders%ROWTYPE;
BEGIN
  PERFORM public.model_a_assert_service();
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found %', _order_id; END IF;

  -- Log event
  INSERT INTO public.shipment_events(order_id, shipping_status, source, tracking_status, location, message, raw)
  VALUES (_order_id, _status, _source, _tracking_status, _location, _message, _raw);

  -- Idempotent for terminal states; allow transitions
  UPDATE public.orders SET
    shipping_status = _status,
    first_scan_at = CASE WHEN first_scan_at IS NULL AND _status IN ('shipped','in_transit','delivered') THEN now() ELSE first_scan_at END,
    shipped_at = CASE WHEN shipped_at IS NULL AND _status IN ('shipped','in_transit','delivered') THEN now() ELSE shipped_at END,
    delivered_at = CASE WHEN delivered_at IS NULL AND _status = 'delivered' THEN now() ELSE delivered_at END,
    lost_marked_at = CASE WHEN lost_marked_at IS NULL AND _status = 'lost_package' THEN now() ELSE lost_marked_at END,
    status = CASE
      WHEN _status = 'delivered' THEN 'delivered'
      WHEN _status IN ('shipped','in_transit') THEN 'shipped'
      ELSE status
    END,
    payout_eligible_at = CASE
      -- First carrier scan triggers a 24h hold then release
      WHEN payout_eligible_at IS NULL
       AND _status IN ('shipped','in_transit')
       AND COALESCE(refunded_amount,0) = 0
       AND payment_status = 'paid'
        THEN now() + interval '24 hours'
      -- Delivery releases immediately
      WHEN _status = 'delivered'
       AND COALESCE(refunded_amount,0) = 0
       AND payment_status = 'paid'
        THEN LEAST(COALESCE(payout_eligible_at, now()), now())
      -- Lost/returned/failed → withdraw eligibility
      WHEN _status IN ('lost_package','returned','delivery_failed')
        THEN NULL
      ELSE payout_eligible_at
    END
  WHERE id = _order_id;
END$function$
;

CREATE OR REPLACE FUNCTION public.enforce_late_shipments()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _stage_a int := 0; _stage_b int := 0; _stage_c int := 0; _stage_d int := 0;
  _o record;
  _b6  timestamptz;
  _b9  timestamptz;
  _b14 timestamptz;
BEGIN
  PERFORM public.model_a_assert_service();
  FOR _o IN
    SELECT id, seller_id, buyer_id, paid_at, shipping_due_at, ship_reminder_count, last_ship_reminder_at, title
      FROM public.orders
     WHERE payment_status = 'paid'
       AND status = 'pending'
       AND shipping_due_at IS NOT NULL
       AND shipping_due_at <= now()
  LOOP
    _b6  := public.add_business_days(_o.paid_at, 6);
    _b9  := public.add_business_days(_o.paid_at, 9);
    _b14 := public.add_business_days(_o.paid_at, 14);

    -- Stage A: gentle reminder once per 24h until shipped
    IF _o.last_ship_reminder_at IS NULL OR _o.last_ship_reminder_at < now() - interval '24 hours' THEN
      INSERT INTO public.notifications (user_id, sender_id, type, body, link)
      VALUES (_o.seller_id, _o.seller_id, 'shipping',
        '⏰ Reminder: ship "' || _o.title || '" — buyer is waiting.', '/store');
      UPDATE public.orders
         SET last_ship_reminder_at = now(),
             ship_reminder_count   = ship_reminder_count + 1
       WHERE id = _o.id;
      _stage_a := _stage_a + 1;
    END IF;

    -- Stage B: 6 business days late → mark late + warn
    IF now() >= _b6 AND NOT _o.id IN (SELECT id FROM public.orders WHERE id = _o.id AND is_late_shipment) THEN
      UPDATE public.orders SET is_late_shipment = true WHERE id = _o.id AND NOT is_late_shipment;
      UPDATE public.profiles SET late_shipment_count = late_shipment_count + 1 WHERE id = _o.seller_id;
      INSERT INTO public.notifications (user_id, sender_id, type, body, link)
      VALUES (_o.seller_id, _o.seller_id, 'warning',
        '⚠️ "' || _o.title || '" is past the 3-day shipping window. Repeated delays affect your seller standing.', '/store');
      INSERT INTO public.notifications (user_id, sender_id, type, body, link)
      VALUES (_o.buyer_id, _o.seller_id, 'shipping',
        '⏳ Your order "' || _o.title || '" has not shipped yet. We''re following up with the seller.', '/orders');
      _stage_b := _stage_b + 1;
    END IF;

    -- Stage C: 9 business days → payout hold + visibility penalty
    IF now() >= _b9 AND NOT (SELECT payout_held FROM public.orders WHERE id = _o.id) THEN
      UPDATE public.orders SET payout_held = true WHERE id = _o.id;
      UPDATE public.profiles
         SET payout_hold = true,
             visibility_penalty_until = GREATEST(COALESCE(visibility_penalty_until, now()), now() + interval '14 days')
       WHERE id = _o.seller_id;
      INSERT INTO public.notifications (user_id, sender_id, type, body, link)
      VALUES (_o.seller_id, _o.seller_id, 'warning',
        '🚫 Payout for "' || _o.title || '" is on hold and your store visibility is reduced for 14 days. Ship or refund to resolve.', '/store');
      _stage_c := _stage_c + 1;
    END IF;

    -- Stage D: 14 business days → admin/audit flag (no auto-suspend)
    IF now() >= _b14 THEN
      INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, meta)
      VALUES (NULL, 'shipping_severely_late', 'order', _o.id,
        jsonb_build_object('seller_id', _o.seller_id, 'paid_at', _o.paid_at, 'days_late_business', 14));
      _stage_d := _stage_d + 1;
    END IF;
  END LOOP;

  -- Auto-clear payout_hold + visibility penalty when seller has zero late open orders
  UPDATE public.profiles p
     SET payout_hold = false
   WHERE payout_hold = true
     AND NOT EXISTS (
       SELECT 1 FROM public.orders o
        WHERE o.seller_id = p.id AND o.payout_held = true AND o.status = 'pending'
     );

  RETURN jsonb_build_object(
    'reminders', _stage_a, 'warnings', _stage_b,
    'payout_holds', _stage_c, 'severe', _stage_d, 'ran_at', now()
  );
END $function$
;

CREATE OR REPLACE FUNCTION public.record_buyer_risk_signal(_user_id uuid, _kind text, _ref_table text DEFAULT NULL::text, _ref_id uuid DEFAULT NULL::uuid, _seller_id uuid DEFAULT NULL::uuid, _metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_weight integer;
  v_score integer;
  v_unique_sellers integer;
  v_existing uuid;
BEGIN
  PERFORM public.model_a_assert_service();
  IF _user_id IS NULL OR _kind IS NULL THEN
    RETURN 0;
  END IF;

  v_weight := public._buyer_signal_weight(_kind);

  INSERT INTO public.buyer_risk_signals (
    user_id, kind, severity_weight, ref_table, ref_id, seller_id, metadata
  ) VALUES (
    _user_id, _kind, v_weight, _ref_table, _ref_id, _seller_id, COALESCE(_metadata, '{}'::jsonb)
  );

  -- 30-day weighted score
  SELECT COALESCE(SUM(severity_weight), 0),
         COUNT(DISTINCT seller_id) FILTER (WHERE seller_id IS NOT NULL)
    INTO v_score, v_unique_sellers
    FROM public.buyer_risk_signals
   WHERE user_id = _user_id
     AND created_at > now() - interval '30 days';

  -- Auto-flag into existing buyer_review_queue when threshold crossed
  IF v_score >= 15 OR v_unique_sellers >= 3 OR _kind IN ('chargeback','dispute_opened') THEN
    SELECT id INTO v_existing
      FROM public.buyer_review_queue
     WHERE buyer_id = _user_id AND status = 'pending'
     LIMIT 1;

    IF v_existing IS NULL THEN
      INSERT INTO public.buyer_review_queue (buyer_id, reason, unpaid_strikes, status)
      VALUES (
        _user_id,
        format('Risk score %s (30d). Latest: %s', v_score, _kind),
        v_score,
        'pending'
      );
    ELSE
      UPDATE public.buyer_review_queue
         SET reason = format('Risk score %s (30d). Latest: %s', v_score, _kind),
             unpaid_strikes = v_score
       WHERE id = v_existing;
    END IF;
  END IF;

  -- High-severity events get a fraud_flag for staff visibility
  IF _kind IN ('chargeback','dispute_opened','bid_no_pay') THEN
    INSERT INTO public.fraud_flags (user_id, flag_type, severity, details)
    VALUES (
      _user_id,
      _kind,
      CASE WHEN _kind = 'chargeback' THEN 'critical'
           WHEN _kind = 'dispute_opened' THEN 'high'
           ELSE 'medium' END,
      jsonb_build_object('ref_table', _ref_table, 'ref_id', _ref_id, 'seller_id', _seller_id)
        || COALESCE(_metadata, '{}'::jsonb)
    );
  END IF;

  RETURN v_score;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.run_financial_reconciliation(_since timestamp with time zone DEFAULT (now() - '7 days'::interval))
 RETURNS TABLE(scanned_orders bigint, missing_commission bigint, missing_shipping_margin bigint, payout_drift bigint, new_alerts bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _scanned bigint := 0;
  _missing_comm bigint := 0;
  _missing_ship bigint := 0;
  _drift bigint := 0;
  _alerts bigint := 0;
  _row record;
BEGIN
  PERFORM public.model_a_assert_service();
  SELECT COUNT(*) INTO _scanned
  FROM orders WHERE payment_status='paid' AND created_at >= _since;

  FOR _row IN
    SELECT o.id, o.amount, o.shipping_amount, o.commission_amount
    FROM orders o
    LEFT JOIN platform_revenue pr
      ON pr.order_id = o.id AND pr.kind = 'marketplace_commission'
    WHERE o.payment_status='paid'
      AND o.created_at >= _since
      AND COALESCE(o.commission_amount,0) > 0
      AND pr.id IS NULL
  LOOP
    _missing_comm := _missing_comm + 1;
    INSERT INTO financial_integrity_alerts(severity, kind, order_id, amount_cents, details)
    SELECT 'warning','missing_commission_ledger', _row.id,
           (_row.commission_amount * 100)::bigint,
           jsonb_build_object('subtotal', _row.amount - _row.shipping_amount)
    WHERE NOT EXISTS (
      SELECT 1 FROM financial_integrity_alerts
      WHERE kind='missing_commission_ledger' AND order_id = _row.id AND resolved_at IS NULL
    );
    _alerts := _alerts + 1;
  END LOOP;

  FOR _row IN
    SELECT o.id, o.shipping_amount, o.label_cost_cents
    FROM orders o
    LEFT JOIN platform_revenue pr
      ON pr.order_id = o.id AND pr.kind = 'shipping_margin'
    WHERE o.payment_status='paid'
      AND o.created_at >= _since
      AND o.label_purchased_at IS NOT NULL
      AND pr.id IS NULL
  LOOP
    _missing_ship := _missing_ship + 1;
    INSERT INTO financial_integrity_alerts(severity, kind, order_id, amount_cents, details)
    SELECT 'warning','missing_shipping_margin', _row.id, _row.label_cost_cents,
           jsonb_build_object('shipping_charged_cents',(_row.shipping_amount*100)::int)
    WHERE NOT EXISTS (
      SELECT 1 FROM financial_integrity_alerts
      WHERE kind='missing_shipping_margin' AND order_id = _row.id AND resolved_at IS NULL
    );
    _alerts := _alerts + 1;
  END LOOP;

  FOR _row IN
    SELECT id, amount, shipping_amount, commission_amount, seller_payout_amount,
           ABS((COALESCE(commission_amount,0) + COALESCE(seller_payout_amount,0))
              - (COALESCE(amount,0) - COALESCE(shipping_amount,0))) AS drift
    FROM orders
    WHERE payment_status='paid'
      AND created_at >= _since
      AND commission_amount IS NOT NULL
      AND seller_payout_amount IS NOT NULL
      AND ABS((COALESCE(commission_amount,0) + COALESCE(seller_payout_amount,0))
            - (COALESCE(amount,0) - COALESCE(shipping_amount,0))) > 0.02
  LOOP
    _drift := _drift + 1;
    INSERT INTO financial_integrity_alerts(severity, kind, order_id, amount_cents, details)
    SELECT 'critical','payout_drift', _row.id, (_row.drift*100)::bigint,
           jsonb_build_object(
             'subtotal', _row.amount - _row.shipping_amount,
             'commission', _row.commission_amount,
             'payout', _row.seller_payout_amount
           )
    WHERE NOT EXISTS (
      SELECT 1 FROM financial_integrity_alerts
      WHERE kind='payout_drift' AND order_id = _row.id AND resolved_at IS NULL
    );
    _alerts := _alerts + 1;
  END LOOP;

  FOR _row IN
    SELECT o.id, o.tax_cents, o.tax_jurisdiction, o.final_charged_total_cents
    FROM orders o
    LEFT JOIN platform_revenue pr
      ON pr.order_id = o.id AND pr.kind = 'sales_tax_collected'
    WHERE o.payment_status='paid'
      AND o.created_at >= _since
      AND COALESCE(o.tax_cents,0) > 0
      AND (COALESCE(o.tax_jurisdiction,'') = '' OR COALESCE(o.final_charged_total_cents,0) = 0 OR pr.id IS NULL)
  LOOP
    INSERT INTO financial_integrity_alerts(severity, kind, order_id, amount_cents, details)
    SELECT 'critical','tax_integrity_gap', _row.id, _row.tax_cents,
           jsonb_build_object(
             'tax_jurisdiction', _row.tax_jurisdiction,
             'final_charged_total_cents', _row.final_charged_total_cents,
             'missing_tax_ledger', true
           )
    WHERE NOT EXISTS (
      SELECT 1 FROM financial_integrity_alerts
      WHERE kind='tax_integrity_gap' AND order_id = _row.id AND resolved_at IS NULL
    );
    _alerts := _alerts + 1;
  END LOOP;

  scanned_orders := _scanned;
  missing_commission := _missing_comm;
  missing_shipping_margin := _missing_ship;
  payout_drift := _drift;
  new_alerts := _alerts;
  RETURN NEXT;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sweep_stuck_auctions()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _row RECORD;
  _finalized int := 0;
  _rearmed int := 0;
  _errors int := 0;
BEGIN
  PERFORM public.model_a_assert_service();
  -- (a) Finalize any expired auction that still has bidders attached
  FOR _row IN
    SELECT id FROM public.live_streams
     WHERE status = 'live'
       AND ends_at IS NOT NULL
       AND ends_at < now() - interval '15 seconds'
       AND winner_id IS NULL
     LIMIT 50
  LOOP
    BEGIN
      PERFORM public.finalize_auction_round(_row.id);
      _finalized := _finalized + 1;
    EXCEPTION WHEN OTHERS THEN
      _errors := _errors + 1;
      INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, meta)
      VALUES (NULL, 'auction_sweep_error', 'live_stream', _row.id,
              jsonb_build_object('error', SQLERRM));
    END;
  END LOOP;

  -- (b) Auto-rearm: a finalized round whose banner has been up for >10s
  --     and remaining quick-start quantity exists.
  FOR _row IN
    SELECT id FROM public.live_streams
     WHERE status = 'live'
       AND winner_id IS NOT NULL
       AND ends_at IS NOT NULL
       AND ends_at < now() - interval '10 seconds'
       AND COALESCE(quick_start_remaining, 0) > 0
     LIMIT 50
  LOOP
    BEGIN
      PERFORM public.rearm_next_round(_row.id);
      _rearmed := _rearmed + 1;
    EXCEPTION WHEN OTHERS THEN
      _errors := _errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('finalized', _finalized, 'rearmed', _rearmed, 'errors', _errors);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reconcile_stale_payments()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _flagged integer := 0; _r record;
BEGIN
  PERFORM public.model_a_assert_service();
  WITH stale AS (
    UPDATE public.orders SET payment_status='failed'
     WHERE payment_status='awaiting_payment' AND created_at < now() - interval '24 hours' AND paid_at IS NULL
    RETURNING id, buyer_id, title, stream_id)
  SELECT count(*) INTO _flagged FROM stale;
  FOR _r IN
    SELECT id, buyer_id, title, stream_id FROM public.orders
     WHERE payment_status='failed' AND created_at < now() - interval '24 hours' AND paid_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.notifications n WHERE n.user_id=orders.buyer_id AND n.link='/orders' AND n.type='payment_failed' AND n.body LIKE '%' || orders.title || '%')
  LOOP
    INSERT INTO public.notifications (user_id, sender_id, type, body, link)
    VALUES (_r.buyer_id, _r.buyer_id, 'payment_failed',
      '⚠️ Your order "' || _r.title || '" expired due to non-payment. Tap to retry.', '/orders');
    IF _r.stream_id IS NOT NULL THEN PERFORM public.record_unpaid_auction_win(_r.buyer_id); END IF;
  END LOOP;
  RETURN COALESCE(_flagged, 0);
END $function$
;

CREATE OR REPLACE FUNCTION public.reconcile_auction_states()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _r record;
  _fixed integer := 0;
BEGIN
  PERFORM public.model_a_assert_service();
  -- Streams whose ends_at passed > 2 minutes ago with a current_bidder
  -- but no order yet → re-trigger finalize_auction_round.
  FOR _r IN
    SELECT ls.id
      FROM public.live_streams ls
     WHERE ls.status = 'live'
       AND ls.ends_at IS NOT NULL
       AND ls.ends_at < now() - interval '2 minutes'
       AND ls.current_bidder_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.orders o
          WHERE o.stream_id = ls.id
            AND o.buyer_id = ls.current_bidder_id
            AND o.amount = ls.current_bid
       )
  LOOP
    BEGIN
      PERFORM public.finalize_auction_round(_r.id);
      _fixed := _fixed + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Don't block other streams
      INSERT INTO public.audit_logs (action, target_type, target_id, meta)
      VALUES ('reconcile_finalize_failed', 'live_stream', _r.id,
              jsonb_build_object('error', SQLERRM));
    END;
  END LOOP;
  RETURN _fixed;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reconcile_sold_items()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _fixed integer := 0;
BEGIN
  PERFORM public.model_a_assert_service();
  WITH actual AS (
    SELECT listing_id, COUNT(*)::int AS paid_count
    FROM public.orders
    WHERE listing_id IS NOT NULL
      AND payment_status = 'paid'
    GROUP BY listing_id
  ), drift AS (
    UPDATE public.listings l
       SET sold_count = LEAST(a.paid_count, COALESCE(l.quantity, a.paid_count))
      FROM actual a
     WHERE l.id = a.listing_id
       AND COALESCE(l.sold_count, 0) <> LEAST(a.paid_count, COALESCE(l.quantity, a.paid_count))
    RETURNING 1
  )
  SELECT count(*) INTO _fixed FROM drift;
  RETURN COALESCE(_fixed, 0);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.run_platform_reconciliation()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _sold int := 0;
  _auctions int := 0;
  _payments int := 0;
  _safety int := 0;
BEGIN
  PERFORM public.model_a_assert_service();
  BEGIN _sold := public.reconcile_sold_items(); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN _auctions := public.reconcile_auction_states(); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN _payments := public.reconcile_stale_payments(); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN _safety := public.apply_live_stream_safety(NULL); EXCEPTION WHEN OTHERS THEN NULL; END;

  INSERT INTO public.audit_logs (action, target_type, meta)
  VALUES ('platform_reconciliation', 'system',
          jsonb_build_object(
            'sold_fixed', _sold,
            'auctions_finalized', _auctions,
            'payments_expired', _payments,
            'safety_actions', _safety,
            'at', now()
          ));

  RETURN jsonb_build_object(
    'sold_fixed', _sold,
    'auctions_finalized', _auctions,
    'payments_expired', _payments,
    'safety_actions', _safety
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.record_unpaid_auction_win(_buyer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _strikes int; _distinct_streams int; _restricted boolean := false;
BEGIN
  PERFORM public.model_a_assert_service();
  IF _buyer_id IS NULL THEN RETURN jsonb_build_object('ok', false); END IF;
  UPDATE public.profiles SET unpaid_strikes=COALESCE(unpaid_strikes,0)+1 WHERE id=_buyer_id RETURNING unpaid_strikes INTO _strikes;
  SELECT COUNT(DISTINCT stream_id) INTO _distinct_streams FROM public.orders WHERE buyer_id=_buyer_id AND payment_status='failed' AND stream_id IS NOT NULL;
  IF _strikes >= 10 AND _distinct_streams >= 10 THEN
    UPDATE public.profiles SET bid_restricted_until = now() + interval '30 days',
      bid_restricted_reason = 'Auto: 10+ unpaid auction wins across 10+ streams'
     WHERE id=_buyer_id AND (bid_restricted_until IS NULL OR bid_restricted_until < now() + interval '30 days');
    INSERT INTO public.buyer_review_queue (buyer_id, reason, unpaid_strikes) VALUES (_buyer_id, 'auto_unpaid_threshold', _strikes);
    INSERT INTO public.notifications (user_id, sender_id, type, body, link)
    VALUES (_buyer_id, _buyer_id, 'account_restricted',
      '⛔ Your account is on hold due to repeated unpaid auction wins. Resolve outstanding orders or contact support.', '/orders');
    _restricted := true;
  END IF;
  RETURN jsonb_build_object('ok', true, 'strikes', _strikes, 'distinct_streams', _distinct_streams, 'restricted', _restricted);
END $function$
;

REVOKE EXECUTE ON FUNCTION public.apply_ai_shipment_scan(_code text, _kind text, _suggested_status text, _carrier text, _confidence numeric, _metadata jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_ai_shipment_scan(_code text, _kind text, _suggested_status text, _carrier text, _confidence numeric, _metadata jsonb) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.mark_order_packed(_order_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_order_packed(_order_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.mark_order_ready(_order_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_order_ready(_order_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.register_shipping_scan(_code text, _kind text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_shipping_scan(_code text, _kind text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.request_payout(_amount_cents integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_payout(_amount_cents integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.record_shipping_adjustment(_order_id uuid, _type text, _cost_cents integer, _notes text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_shipping_adjustment(_order_id uuid, _type text, _cost_cents integer, _notes text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.finalize_auction_round(_stream_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_auction_round(_stream_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.rearm_next_round(_stream_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rearm_next_round(_stream_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.claim_break_slots(_stream_id uuid, _slot_numbers integer[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_break_slots(_stream_id uuid, _slot_numbers integer[]) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.append_dispute_message(_dispute_id uuid, _body text, _username text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.append_dispute_message(_dispute_id uuid, _body text, _username text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.admin_override_trust(_user_id uuid, _instant_pct integer, _frozen boolean, _reason text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_override_trust(_user_id uuid, _instant_pct integer, _frozen boolean, _reason text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.admin_reset_seller_trust(_user_id uuid, _reason text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_seller_trust(_user_id uuid, _reason text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.clear_hold_admin(_hold_id uuid, _override boolean, _notes text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_hold_admin(_hold_id uuid, _override boolean, _notes text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.admin_list_platform_revenue(_limit integer, _offset integer, _kind platform_revenue_kind) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_platform_revenue(_limit integer, _offset integer, _kind platform_revenue_kind) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.admin_revenue_summary(_since timestamp with time zone) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_revenue_summary(_since timestamp with time zone) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.admin_run_financial_reconciliation(_since timestamp with time zone) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_run_financial_reconciliation(_since timestamp with time zone) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.request_platform_payout(_amount_cents bigint, _destination text, _notes text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_platform_payout(_amount_cents bigint, _destination text, _notes text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.log_admin_action(_action text, _target_table text, _target_id uuid, _subject_user_id uuid, _before jsonb, _after jsonb, _reason text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_admin_action(_action text, _target_table text, _target_id uuid, _subject_user_id uuid, _before jsonb, _after jsonb, _reason text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.admin_replay_finalize(_stream_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_replay_finalize(_stream_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.admin_set_verification_status(_target_user uuid, _status text, _reason text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_verification_status(_target_user uuid, _status text, _reason text) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.mark_order_packed(_order_id uuid)
 RETURNS TABLE(prev_status text, new_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_seller uuid; v_prev text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
  SELECT seller_id, prep_status INTO v_seller, v_prev FROM public.orders WHERE id = _order_id;
  IF v_seller IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_seller IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.orders
    SET prep_status = 'packed', packed_at = COALESCE(packed_at, now())
    WHERE id = _order_id AND prep_status NOT IN ('shipped','delivered');
  prev_status := v_prev; new_status := 'packed';
  RETURN NEXT;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_order_ready(_order_id uuid)
 RETURNS TABLE(prev_status text, new_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_seller uuid; v_prev text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
  SELECT seller_id, prep_status INTO v_seller, v_prev FROM public.orders WHERE id = _order_id;
  IF v_seller IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_seller IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.orders
    SET prep_status = 'ready_for_dropoff',
        ready_at = COALESCE(ready_at, now()),
        packed_at = COALESCE(packed_at, now())
    WHERE id = _order_id AND prep_status NOT IN ('shipped','delivered');
  prev_status := v_prev; new_status := 'ready_for_dropoff';
  RETURN NEXT;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.register_shipping_scan(_code text, _kind text DEFAULT 'tracking'::text)
 RETURNS TABLE(order_id uuid, prev_status text, new_status text, result text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id uuid; v_seller uuid; v_prev text; v_new text; v_result text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
  -- Try match: exact tracking number
  SELECT o.id, o.seller_id, o.prep_status
    INTO v_order_id, v_seller, v_prev
    FROM public.orders o
    WHERE o.tracking_number = _code
    ORDER BY o.created_at DESC LIMIT 1;

  -- Fallback: by order short id (first 8 chars)
  IF v_order_id IS NULL AND length(_code) >= 8 THEN
    SELECT o.id, o.seller_id, o.prep_status
      INTO v_order_id, v_seller, v_prev
      FROM public.orders o
      WHERE substr(o.id::text,1,8) = lower(substr(_code,1,8))
        AND o.seller_id = auth.uid()
      LIMIT 1;
  END IF;

  IF v_order_id IS NULL THEN
    INSERT INTO public.shipping_scans(order_id, scanned_by, code, kind, result)
      VALUES (NULL, auth.uid(), _code, _kind, 'unmatched');
    order_id := NULL; prev_status := NULL; new_status := NULL; result := 'unmatched';
    RETURN NEXT; RETURN;
  END IF;

  IF v_seller IS DISTINCT FROM auth.uid() THEN
    INSERT INTO public.shipping_scans(order_id, scanned_by, code, kind, result)
      VALUES (v_order_id, auth.uid(), _code, _kind, 'mismatch');
    order_id := v_order_id; prev_status := v_prev; new_status := v_prev; result := 'mismatch';
    RETURN NEXT; RETURN;
  END IF;

  -- advance status
  v_new := CASE
    WHEN v_prev IN ('shipped','delivered') THEN v_prev
    WHEN v_prev = 'ready_for_dropoff' THEN 'ready_for_dropoff'
    ELSE 'ready_for_dropoff'
  END;

  UPDATE public.orders
    SET prep_status = v_new,
        ready_at = COALESCE(ready_at, now()),
        packed_at = COALESCE(packed_at, now())
    WHERE id = v_order_id;

  v_result := 'matched';
  INSERT INTO public.shipping_scans(order_id, scanned_by, code, kind, result, prev_status, new_status)
    VALUES (v_order_id, auth.uid(), _code, _kind, v_result, v_prev, v_new);

  order_id := v_order_id; prev_status := v_prev; new_status := v_new; result := v_result;
  RETURN NEXT;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_ai_shipment_scan(_code text, _kind text DEFAULT 'photo'::text, _suggested_status text DEFAULT 'ready_for_dropoff'::text, _carrier text DEFAULT NULL::text, _confidence numeric DEFAULT NULL::numeric, _metadata jsonb DEFAULT NULL::jsonb)
 RETURNS TABLE(order_id uuid, prev_status text, new_status text, result text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id uuid; v_seller uuid; v_prev text; v_new text; v_rank int; v_prev_rank int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;

  -- Normalize status
  IF _suggested_status IS NULL OR _suggested_status NOT IN ('label_created','ready_for_dropoff') THEN
    _suggested_status := 'ready_for_dropoff';
  END IF;

  -- Try exact tracking number match
  SELECT o.id, o.seller_id, o.prep_status
    INTO v_order_id, v_seller, v_prev
    FROM public.orders o
    WHERE o.tracking_number = _code
    ORDER BY o.created_at DESC LIMIT 1;

  -- Fallback: prefix match for partial OCR reads (>= 10 chars)
  IF v_order_id IS NULL AND length(_code) >= 10 THEN
    SELECT o.id, o.seller_id, o.prep_status
      INTO v_order_id, v_seller, v_prev
      FROM public.orders o
      WHERE o.tracking_number IS NOT NULL
        AND (o.tracking_number ILIKE _code || '%' OR _code ILIKE o.tracking_number || '%')
        AND o.seller_id = auth.uid()
      ORDER BY o.created_at DESC LIMIT 1;
  END IF;

  IF v_order_id IS NULL THEN
    INSERT INTO public.shipping_scans(order_id, scanned_by, code, kind, result, carrier, suggested_status, ai_confidence, ai_metadata)
      VALUES (NULL, auth.uid(), _code, _kind, 'unmatched', _carrier, _suggested_status, _confidence, _metadata);
    order_id := NULL; prev_status := NULL; new_status := NULL; result := 'unmatched';
    RETURN NEXT; RETURN;
  END IF;

  IF v_seller <> auth.uid() THEN
    INSERT INTO public.shipping_scans(order_id, scanned_by, code, kind, result, carrier, suggested_status, ai_confidence, ai_metadata)
      VALUES (v_order_id, auth.uid(), _code, _kind, 'mismatch', _carrier, _suggested_status, _confidence, _metadata);
    order_id := v_order_id; prev_status := v_prev; new_status := v_prev; result := 'mismatch';
    RETURN NEXT; RETURN;
  END IF;

  -- Never downgrade. Rank statuses.
  v_prev_rank := CASE COALESCE(v_prev,'label_pending')
    WHEN 'label_pending' THEN 0 WHEN 'label_created' THEN 1
    WHEN 'prepared' THEN 2 WHEN 'packed' THEN 3
    WHEN 'ready_for_dropoff' THEN 4 WHEN 'shipped' THEN 5
    WHEN 'delivered' THEN 6 ELSE 0 END;
  v_rank := CASE _suggested_status
    WHEN 'label_created' THEN 1 WHEN 'ready_for_dropoff' THEN 4
    WHEN 'shipped' THEN 5 WHEN 'delivered' THEN 6 ELSE 4 END;
  v_new := CASE WHEN v_rank > v_prev_rank THEN _suggested_status ELSE v_prev END;

  UPDATE public.orders
    SET prep_status = v_new,
        tracking_number = COALESCE(tracking_number, _code),
        carrier = COALESCE(carrier, _carrier),
        packed_at = COALESCE(packed_at, CASE WHEN v_new IN ('packed','ready_for_dropoff','shipped','delivered') THEN now() END),
        ready_at = COALESCE(ready_at, CASE WHEN v_new IN ('ready_for_dropoff','shipped','delivered') THEN now() END)
    WHERE id = v_order_id;

  INSERT INTO public.shipping_scans(order_id, scanned_by, code, kind, result, prev_status, new_status, carrier, suggested_status, ai_confidence, ai_metadata)
    VALUES (v_order_id, auth.uid(), _code, _kind, 'matched', v_prev, v_new, _carrier, _suggested_status, _confidence, _metadata);

  order_id := v_order_id; prev_status := v_prev; new_status := v_new; result := 'matched';
  RETURN NEXT;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.finalize_auction_round(_stream_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _s public.live_streams%ROWTYPE;
  _caller uuid := auth.uid();
  _winner_id uuid;
  _winning_bid numeric;
  _winner_username text;
  _seller_username text;
  _label text;
  _item_name text;
  _next_round int;
  _existing_order uuid;
  _order_id uuid;
  _ship numeric := 0;
  _ship_for_this numeric := 0;
  _cap numeric;
  _p record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
  SELECT * INTO _s FROM public.live_streams WHERE id = _stream_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stream not found';
  END IF;

  IF NOT COALESCE(_caller = _s.seller_id OR _caller = _s.current_bidder_id OR public.has_role(_caller, 'admin') OR public.has_role(_caller, 'owner'), false) THEN
    RAISE EXCEPTION 'Only the seller, winning bidder, or admin can finalize';
  END IF;

  IF (_s.ends_at IS NULL OR _s.ends_at > now()) AND NOT (public.has_role(_caller,'admin') OR public.has_role(_caller,'owner')) THEN
    RAISE EXCEPTION 'Auction has not ended';
  END IF;
  _winner_id := _s.current_bidder_id;
  _winning_bid := COALESCE(_s.current_bid, 0);
  _item_name := COALESCE(NULLIF(_s.current_item, ''), _s.title, 'Live auction item');
  _label := _item_name;
  _next_round := COALESCE(_s.round_number, 0) + 1;

  IF _s.winner_id IS NOT NULL
     AND _s.winner_id = _winner_id
     AND COALESCE(_s.winning_bid, 0) = _winning_bid THEN
    SELECT id INTO _existing_order FROM public.orders
      WHERE stream_id = _stream_id AND buyer_id = _winner_id
      ORDER BY created_at DESC LIMIT 1;
    RETURN jsonb_build_object('ok', true, 'already_finalized', true, 'order_id', _existing_order);
  END IF;

  IF _winner_id IS NULL THEN
    UPDATE public.live_streams SET ends_at = NULL WHERE id = _stream_id;
    INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, meta)
      VALUES (_caller, 'auction_no_winner', 'live_stream', _stream_id,
              jsonb_build_object('round', _next_round));
    RETURN jsonb_build_object('ok', true, 'no_winner', true);
  END IF;

  SELECT username INTO _winner_username FROM public.profiles WHERE id = _winner_id;
  SELECT username INTO _seller_username FROM public.profiles WHERE id = _s.seller_id;

  SELECT shipping_cap INTO _cap FROM public.profiles WHERE id = _s.seller_id;
  _ship := COALESCE(_s.shipping_price, 0);
  _ship_for_this := CASE WHEN _cap IS NULL THEN _ship ELSE GREATEST(0, LEAST(_ship, _cap)) END;

  SELECT p.full_name, p.address_line1, p.address_city, p.address_state, p.address_zip, p.address_country
    INTO _p FROM public.profiles p WHERE p.id = _winner_id;

  INSERT INTO public.receipts (stream_id, buyer_id, seller_id, item_name, item_image_url, amount)
    VALUES (_stream_id, _winner_id, _s.seller_id, _label, _s.item_image_url, _winning_bid);

  BEGIN
    INSERT INTO public.orders (
      buyer_id, seller_id, title, description, amount, shipping_amount, item_image_url,
      stream_id, condition, status, payment_status,
      ship_name, ship_address, ship_city, ship_state, ship_zip, ship_country
    ) VALUES (
      _winner_id, _s.seller_id, _label, _s.item_description,
      _winning_bid + _ship_for_this, _ship_for_this, _s.item_image_url, _stream_id,
      _s.current_condition, 'pending', 'awaiting_payment',
      COALESCE(_p.full_name, _winner_username), COALESCE(_p.address_line1, ''),
      COALESCE(_p.address_city, ''), COALESCE(_p.address_state, ''),
      COALESCE(_p.address_zip, ''), COALESCE(_p.address_country, 'US')
    ) RETURNING id INTO _order_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO _order_id FROM public.orders
      WHERE stream_id = _stream_id AND buyer_id = _winner_id
      ORDER BY created_at DESC LIMIT 1;
  END;

  UPDATE public.live_streams SET
    winner_id = _winner_id,
    winning_bid = _winning_bid,
    winner_username = _winner_username,
    round_number = _next_round
  WHERE id = _stream_id;

  INSERT INTO public.notifications (user_id, sender_id, type, body, link)
    VALUES (_winner_id, _winner_id, 'won',
      '🎉 You won Bid #' || _next_round || ' "' || _item_name ||
      '" for $' || _winning_bid || '. Tap to pay now.', '/orders');

  INSERT INTO public.notifications (user_id, sender_id, type, body, link)
    VALUES (_s.seller_id, _s.seller_id, 'sale',
      '💰 Sold "' || _item_name || '" to @' || COALESCE(_winner_username,'buyer') ||
      ' for $' || _winning_bid, '/store');

  PERFORM set_config('app.bypass_dm_check', 'on', true);
  BEGIN
    INSERT INTO public.direct_messages (sender_id, sender_username, recipient_id, content)
    VALUES (_s.seller_id, COALESCE(_seller_username, 'seller'), _winner_id,
      '🏆 You won "' || _item_name || '" for $' || _winning_bid ||
      CASE WHEN _ship_for_this > 0 THEN ' + $' || _ship_for_this || ' shipping' ELSE '' END || '. Complete payment from your Orders/Cart.');
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'winner DM failed: %', SQLERRM;
  END;

  INSERT INTO public.stream_payment_events
    (stream_id, seller_id, buyer_id, buyer_username, order_id, event_type, amount, item_label, message)
  VALUES
    (_stream_id, _s.seller_id, _winner_id, _winner_username, _order_id, 'payment_pending', _winning_bid, _label,
     'Awaiting payment for auction win');

  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, meta)
    VALUES (_caller, 'auction_finalized', 'live_stream', _stream_id,
            jsonb_build_object('winner_id', _winner_id, 'amount', _winning_bid, 'shipping_amount', _ship_for_this, 'order_id', _order_id, 'round', _next_round));

  RETURN jsonb_build_object('ok', true, 'order_id', _order_id, 'winner_id', _winner_id, 'winner_username', _winner_username, 'amount', _winning_bid, 'shipping_amount', _ship_for_this, 'round_number', _next_round);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rearm_next_round(_stream_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _s public.live_streams%ROWTYPE;
  _caller uuid := auth.uid();
  _is_admin boolean;
  _remaining int;
  _sec int;
  _start numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
  SELECT * INTO _s FROM public.live_streams WHERE id = _stream_id FOR UPDATE;
  IF _s.id IS NULL THEN RAISE EXCEPTION 'Stream not found'; END IF;

  _is_admin := _caller IS NOT NULL AND (public.has_role(_caller,'admin') OR public.has_role(_caller,'owner'));
  -- Allow seller, admin, or system-invoked (auth.uid() IS NULL via cron) to rearm.
  IF _caller IS NOT NULL AND NOT _is_admin AND _caller <> _s.seller_id THEN
    RAISE EXCEPTION 'Only the seller or admin can rearm';
  END IF;

  _remaining := GREATEST(0, COALESCE(_s.quick_start_remaining, 0));
  _sec := GREATEST(5, COALESCE(_s.default_timer_sec, 30));
  _start := GREATEST(0.01, COALESCE(_s.default_starting_bid, _s.starting_bid, 1));

  IF _remaining > 0 THEN
    UPDATE public.live_streams SET
      ends_at = now() + make_interval(secs => _sec),
      starting_bid = _start,
      current_bid = _start,
      current_bidder_id = NULL,
      winner_id = NULL,
      winning_bid = NULL,
      winner_username = NULL,
      pinned_card = NULL,
      snipe_extends = 0,
      sudden_death_active = false,
      quick_start_remaining = _remaining - 1,
      last_activity_at = now(),
      last_activity_type = 'round_rearmed'
    WHERE id = _stream_id;
  ELSE
    UPDATE public.live_streams SET
      ends_at = NULL,
      current_bidder_id = NULL,
      winner_id = NULL,
      winning_bid = NULL,
      winner_username = NULL,
      pinned_card = NULL
    WHERE id = _stream_id;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, meta)
  VALUES (_caller, 'auction_rearmed', 'live_stream', _stream_id,
          jsonb_build_object('remaining', _remaining, 'timer_sec', _sec, 'starting_bid', _start));

  RETURN jsonb_build_object('ok', true, 'remaining', GREATEST(0, _remaining - 1));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.append_dispute_message(_dispute_id uuid, _body text, _username text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  d record;
  is_admin boolean;
  role_label text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _body IS NULL OR length(btrim(_body)) = 0 THEN
    RAISE EXCEPTION 'Message body required';
  END IF;
  IF length(_body) > 2000 THEN
    RAISE EXCEPTION 'Message too long';
  END IF;

  SELECT * INTO d FROM public.disputes WHERE id = _dispute_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Dispute not found'; END IF;

  is_admin := public.has_role(auth.uid(), 'admin'::app_role)
           OR public.has_role(auth.uid(), 'owner'::app_role);

  IF NOT COALESCE(is_admin OR auth.uid() = d.reporter_id OR auth.uid() = d.reported_user_id, false) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF is_admin THEN role_label := 'admin';
  ELSIF auth.uid() = d.reporter_id THEN role_label := 'reporter';
  ELSE role_label := 'reported';
  END IF;

  UPDATE public.disputes
  SET messages = COALESCE(messages, '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object(
          'user_id', auth.uid(),
          'username', COALESCE(_username, 'user'),
          'role', role_label,
          'body', btrim(_body),
          'at', now()
        )
      ),
      updated_at = now()
  WHERE id = _dispute_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_break_slots(_stream_id uuid, _slot_numbers integer[])
 RETURNS TABLE(order_id uuid, claimed_count integer, total_amount numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _buyer uuid := auth.uid();
  _seller uuid;
  _stream_title text;
  _slot_count integer;
  _price numeric;
  _prefix text;
  _characters jsonb;
  _item_image text;
  _username text;
  _full_name text;
  _address text;
  _city text;
  _state text;
  _zip text;
  _country text;
  _nums integer[];
  _labels text[];
  _order_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
  IF _buyer IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to claim a character';
  END IF;

  SELECT ls.seller_id,
         ls.title,
         ls.break_slot_count,
         COALESCE(ls.break_slot_price, 10),
         ls.break_slot_prefix,
         ls.break_characters,
         COALESCE(ls.item_image_url, ls.thumbnail_url)
    INTO _seller, _stream_title, _slot_count, _price, _prefix, _characters, _item_image
  FROM public.live_streams ls
  WHERE ls.id = _stream_id
    AND ls.break_mode = 'open'
  FOR UPDATE;

  IF _seller IS NULL THEN
    RAISE EXCEPTION 'This break is not open';
  END IF;

  IF _seller = _buyer THEN
    RAISE EXCEPTION 'Host cannot claim their own break slots';
  END IF;

  SELECT array_agg(DISTINCT n ORDER BY n)
    INTO _nums
  FROM unnest(COALESCE(_slot_numbers, ARRAY[]::integer[])) AS n
  WHERE n BETWEEN 1 AND COALESCE(_slot_count, 0);

  IF _nums IS NULL OR array_length(_nums, 1) IS NULL THEN
    RAISE EXCEPTION 'Choose at least one available character';
  END IF;

  IF array_length(_nums, 1) > 10 THEN
    RAISE EXCEPTION 'Claim up to 10 characters at a time';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.break_slots bs
    WHERE bs.stream_id = _stream_id
      AND bs.slot_number = ANY(_nums)
  ) THEN
    RAISE EXCEPTION 'One of those characters was just claimed';
  END IF;

  SELECT COALESCE(p.username, 'buyer'),
         COALESCE(p.full_name, p.username, 'Buyer'),
         COALESCE(p.address_line1, ''),
         COALESCE(p.address_city, ''),
         COALESCE(p.address_state, ''),
         COALESCE(p.address_zip, ''),
         COALESCE(p.address_country, 'US')
    INTO _username, _full_name, _address, _city, _state, _zip, _country
  FROM public.profiles p
  WHERE p.id = _buyer;

  SELECT array_agg(
           COALESCE(NULLIF(_characters ->> (n - 1), ''), COALESCE(_prefix, '#') || n::text)
           ORDER BY n
         )
    INTO _labels
  FROM unnest(_nums) AS n;

  INSERT INTO public.orders (
    buyer_id,
    seller_id,
    title,
    description,
    amount,
    item_image_url,
    stream_id,
    status,
    payment_status,
    paid_at,
    ship_name,
    ship_address,
    ship_city,
    ship_state,
    ship_zip,
    ship_country
  ) VALUES (
    _buyer,
    _seller,
    'Mystery Break — ' || array_length(_nums, 1)::text || ' character' || CASE WHEN array_length(_nums, 1) = 1 THEN '' ELSE 's' END,
    'Mystery Break in ' || COALESCE(_stream_title, 'live stream') || ': ' || array_to_string(_labels, ', '),
    _price * array_length(_nums, 1),
    _item_image,
    _stream_id,
    'pending',
    'awaiting_payment',
    NULL,
    _full_name,
    _address,
    _city,
    _state,
    _zip,
    _country
  )
  RETURNING id INTO _order_id;

  INSERT INTO public.break_slots (
    stream_id,
    buyer_id,
    buyer_username,
    amount,
    slot_number,
    character_label,
    team_label,
    assigned_at,
    order_id
  )
  SELECT _stream_id,
         _buyer,
         _username,
         _price,
         n,
         COALESCE(NULLIF(_characters ->> (n - 1), ''), COALESCE(_prefix, '#') || n::text),
         COALESCE(NULLIF(_characters ->> (n - 1), ''), COALESCE(_prefix, '#') || n::text),
         now(),
         _order_id
  FROM unnest(_nums) AS n;

  order_id := _order_id;
  claimed_count := array_length(_nums, 1);
  total_amount := _price * claimed_count;
  RETURN NEXT;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.request_payout(_amount_cents integer)
 RETURNS payout_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid UUID := auth.uid();
  _existing UUID;
  _payable BIGINT;
  _row public.payout_requests;
  _bal_before BIGINT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _amount_cents IS NULL OR _amount_cents <= 0 THEN RAISE EXCEPTION 'Invalid payout amount'; END IF;

  -- Per-user advisory lock prevents concurrent payout requests across tabs/clients
  PERFORM pg_advisory_xact_lock(hashtext('payout:' || _uid::text));

  SELECT id INTO _existing FROM public.payout_requests
   WHERE user_id = _uid AND status IN ('requested','processing') LIMIT 1;
  IF _existing IS NOT NULL THEN RAISE EXCEPTION 'A payout is already in progress'; END IF;

  -- Re-validate payable server-side
  SELECT payable_cents INTO _payable FROM public.compute_seller_payable(_uid);
  IF _payable IS NULL OR _amount_cents > _payable THEN
    RAISE EXCEPTION 'Requested amount exceeds available balance ($ %)', (_payable::numeric/100);
  END IF;

  SELECT COALESCE(balance_cents,0) INTO _bal_before FROM public.profiles WHERE id = _uid;

  INSERT INTO public.payout_requests(user_id, amount_cents, status)
  VALUES (_uid, _amount_cents, 'processing') RETURNING * INTO _row;

  INSERT INTO public.balance_audit_log(user_id, event_type, delta_cents, balance_before, balance_after, reference_table, reference_id, metadata)
  VALUES (_uid, 'payout_requested', -_amount_cents, _bal_before, _bal_before, 'payout_requests', _row.id::text, jsonb_build_object('status','processing'));

  RETURN _row;
END $function$
;

REVOKE EXECUTE ON FUNCTION public.record_shipping_adjustment(_order_id uuid, _type text, _cost_cents integer, _notes text) FROM authenticated;
-- Reissue/refund fee operation must move to a new service-only function taking verified
-- provider transaction ID and seller derived from the order. Current helper requires auth.uid
-- and cannot serve existing admin-client calls; do not deploy revocation before caller replacement.

-- Table/write gates and trigger replacements are specified in security-patch-proposal.md.
-- This candidate is NOT a complete safe production rollout without those companion patches.
-- Internal-function call graphs, cron, HOLD admin, prep and auctions must be tested first.
