
-- 1) Extend trust tier enum with diamond (top tier, 200+ deliveries)
DO $$ BEGIN
  ALTER TYPE public.seller_trust_tier ADD VALUE IF NOT EXISTS 'diamond';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2) Rewrite recalc_seller_trust with strict "successful delivery" definition
--    and the new 6-tier instant-release schedule.
CREATE OR REPLACE FUNCTION public.recalc_seller_trust(_user_id UUID)
RETURNS public.seller_trust LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _delivered INTEGER;
  _total_recent INTEGER;
  _refunds INTEGER;
  _disputes INTEGER;
  _late INTEGER;
  _unscanned INTEGER;
  _insurance_claims INTEGER;
  _refund_rate NUMERIC := 0;
  _dispute_rate NUMERIC := 0;
  _late_rate NUMERIC := 0;
  _tier public.seller_trust_tier;
  _instant INTEGER;
  _fraud_cap INTEGER := 100;
  _auto_freeze BOOLEAN := false;
  _row public.seller_trust;
BEGIN
  -- Strict successful-delivery count: delivered, paid, no refund, no dispute,
  -- not lost, not returned, has a valid carrier scan, no active insurance claim.
  SELECT COUNT(*) INTO _delivered
  FROM public.orders o
  WHERE o.seller_id = _user_id
    AND o.status = 'delivered'
    AND o.payment_status = 'paid'
    AND COALESCE(o.refunded_amount, 0) = 0
    AND o.lost_marked_at IS NULL
    AND o.first_scan_at IS NOT NULL
    AND o.shipping_status <> 'returned'
    AND o.insurance_status NOT IN ('claim_pending','claim_approved','reimbursed')
    AND NOT EXISTS (
      SELECT 1 FROM public.disputes d
      WHERE d.order_id = o.id
        AND d.lifecycle_status NOT IN ('resolved_seller','closed_no_action')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.fraud_flags f
      WHERE f.user_id = _user_id
        AND f.flag_type = 'insurance_fraud'
        AND f.resolved_at IS NULL
        AND (f.details->>'order_id')::uuid = o.id
    );

  -- Fraud signals over the last 90 days
  SELECT COUNT(*) INTO _total_recent
  FROM public.orders WHERE seller_id = _user_id
    AND payment_status = 'paid'
    AND created_at > now() - interval '90 days';

  IF _total_recent >= 10 THEN
    SELECT COUNT(*) INTO _refunds FROM public.orders
      WHERE seller_id = _user_id AND payment_status = 'paid'
        AND COALESCE(refunded_amount,0) > 0
        AND created_at > now() - interval '90 days';
    SELECT COUNT(*) INTO _disputes FROM public.disputes d
      JOIN public.orders o ON o.id = d.order_id
      WHERE o.seller_id = _user_id
        AND d.created_at > now() - interval '90 days';
    SELECT COUNT(*) INTO _late FROM public.orders
      WHERE seller_id = _user_id AND is_late_shipment = true
        AND created_at > now() - interval '90 days';
    _refund_rate := _refunds::numeric / _total_recent;
    _dispute_rate := _disputes::numeric / _total_recent;
    _late_rate := _late::numeric / _total_recent;
  END IF;

  SELECT COUNT(*) INTO _unscanned FROM public.orders
    WHERE seller_id = _user_id
      AND shipping_status = 'label_created'
      AND first_scan_at IS NULL
      AND label_purchased_at < now() - interval '5 days';

  SELECT COUNT(*) INTO _insurance_claims FROM public.insurance_claims c
    JOIN public.orders o ON o.id = c.order_id
    WHERE o.seller_id = _user_id
      AND c.status IN ('approved','reimbursed')
      AND c.created_at > now() - interval '90 days';

  -- Auto-freeze on critical signals
  IF _refund_rate > 0.25 OR _dispute_rate > 0.10 OR _insurance_claims >= 5 THEN
    _auto_freeze := true;
  END IF;

  -- Soft tier cap based on fraud signals
  IF _refund_rate > 0.15 OR _dispute_rate > 0.05 OR _late_rate > 0.30
     OR _unscanned >= 3 OR _insurance_claims >= 3 THEN
    _fraud_cap := 25;   -- cap at Bronze
  ELSIF _late_rate > 0.15 OR _unscanned >= 1 THEN
    _fraud_cap := 50;   -- cap at Gold
  END IF;

  -- New tier schedule
  IF _delivered >= 200 THEN _tier := 'diamond';  _instant := 100;
  ELSIF _delivered >= 101 THEN _tier := 'platinum'; _instant := 75;
  ELSIF _delivered >= 76  THEN _tier := 'gold';     _instant := 50;
  ELSIF _delivered >= 51  THEN _tier := 'silver';   _instant := 40;
  ELSIF _delivered >= 26  THEN _tier := 'bronze';   _instant := 25;
  ELSE                          _tier := 'new';     _instant := 10;
  END IF;

  _instant := LEAST(_instant, _fraud_cap);

  INSERT INTO public.seller_trust (user_id, completed_deliveries, tier, instant_release_pct, pending_release_pct, frozen, updated_at)
  VALUES (_user_id, _delivered, _tier, _instant, 100 - _instant, _auto_freeze, now())
  ON CONFLICT (user_id) DO UPDATE
    SET completed_deliveries = EXCLUDED.completed_deliveries,
        tier = EXCLUDED.tier,
        instant_release_pct = EXCLUDED.instant_release_pct,
        pending_release_pct = EXCLUDED.pending_release_pct,
        frozen = CASE
          WHEN public.seller_trust.frozen = true THEN true  -- keep manual freezes sticky
          ELSE EXCLUDED.frozen
        END,
        updated_at = now()
  RETURNING * INTO _row;

  -- Log auto-freeze as a fraud flag so admins can review
  IF _auto_freeze THEN
    INSERT INTO public.fraud_flags (user_id, flag_type, severity, auto_action, details)
    SELECT _user_id, 'auto_freeze_payouts', 'high', 'freeze_payouts',
      jsonb_build_object(
        'refund_rate', _refund_rate,
        'dispute_rate', _dispute_rate,
        'insurance_claims_90d', _insurance_claims,
        'late_rate', _late_rate,
        'unscanned_labels', _unscanned)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.fraud_flags
      WHERE user_id = _user_id AND flag_type = 'auto_freeze_payouts'
        AND resolved_at IS NULL
    );
  END IF;

  RETURN _row;
END $$;
GRANT EXECUTE ON FUNCTION public.recalc_seller_trust(UUID) TO authenticated;

-- 3) Admin: reset seller trust progression (e.g. after an investigation)
CREATE OR REPLACE FUNCTION public.admin_reset_seller_trust(_user_id UUID, _reason TEXT)
RETURNS public.seller_trust LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.seller_trust;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  UPDATE public.seller_trust
     SET completed_deliveries = 0,
         tier = 'new',
         instant_release_pct = 10,
         pending_release_pct = 90,
         manual_override_pct = NULL,
         frozen = false,
         updated_at = now()
   WHERE user_id = _user_id
   RETURNING * INTO _row;

  INSERT INTO public.fraud_flags (user_id, flag_type, severity, auto_action, details)
  VALUES (_user_id, 'manual_trust_reset', 'medium', 'reset_progression',
          jsonb_build_object('admin_id', auth.uid(), 'reason', _reason));

  RETURN _row;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_reset_seller_trust(UUID, TEXT) TO authenticated;
