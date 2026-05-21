
-- ============================================================================
-- SELLER VERIFICATION HELPER
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_seller_verified(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.stripe_accounts sa ON sa.seller_id = p.id
    WHERE p.id = _user_id
      AND COALESCE(sa.charges_enabled, false) = true
      AND COALESCE(sa.payouts_enabled, false) = true
      AND COALESCE(sa.details_submitted, false) = true
  );
$$;

-- Block payout requests for unverified sellers.
CREATE OR REPLACE FUNCTION public.assert_seller_verified_for_payout()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_seller_verified(NEW.user_id) THEN
    RAISE EXCEPTION 'Stripe identity verification required before requesting payouts'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payout_requires_verification ON public.payout_requests;
CREATE TRIGGER trg_payout_requires_verification
  BEFORE INSERT ON public.payout_requests
  FOR EACH ROW EXECUTE FUNCTION public.assert_seller_verified_for_payout();

-- ============================================================================
-- BUYER RISK SIGNALS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.buyer_risk_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL,
  severity_weight integer NOT NULL DEFAULT 1,
  ref_table text,
  ref_id uuid,
  seller_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT buyer_risk_signals_kind_check CHECK (kind IN (
    'payment_failed','checkout_failed','order_cancelled_by_buyer',
    'refund_requested','dispute_opened','chargeback',
    'not_delivered_claim','bid_retracted','bid_no_pay',
    'multi_seller_complaint','suspicious_activity'
  ))
);

CREATE INDEX IF NOT EXISTS idx_buyer_risk_signals_user_created
  ON public.buyer_risk_signals (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_buyer_risk_signals_kind
  ON public.buyer_risk_signals (kind, created_at DESC);

ALTER TABLE public.buyer_risk_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read risk signals" ON public.buyer_risk_signals
  FOR SELECT USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'owner'::app_role) OR
    has_role(auth.uid(), 'moderator'::app_role) OR
    has_role(auth.uid(), 'support'::app_role)
  );

-- ============================================================================
-- BUYER RESTRICTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.buyer_restrictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL,
  cents_limit integer,
  reason text NOT NULL,
  created_by uuid,
  active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  cleared_at timestamptz,
  cleared_by uuid,
  CONSTRAINT buyer_restrictions_kind_check CHECK (kind IN (
    'purchase_block','bid_limit','require_verification','frozen'
  ))
);

CREATE INDEX IF NOT EXISTS idx_buyer_restrictions_user_active
  ON public.buyer_restrictions (user_id, active);

ALTER TABLE public.buyer_restrictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read restrictions" ON public.buyer_restrictions
  FOR SELECT USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'owner'::app_role) OR
    has_role(auth.uid(), 'moderator'::app_role) OR
    has_role(auth.uid(), 'support'::app_role)
  );

CREATE POLICY "user reads own restrictions" ON public.buyer_restrictions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "staff write restrictions" ON public.buyer_restrictions
  FOR ALL USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'owner'::app_role)
  ) WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'owner'::app_role)
  );

-- ============================================================================
-- HELPERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.buyer_active_restrictions(_user_id uuid)
RETURNS SETOF public.buyer_restrictions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.buyer_restrictions
   WHERE user_id = _user_id
     AND active = true
     AND (expires_at IS NULL OR expires_at > now());
$$;

CREATE OR REPLACE FUNCTION public.buyer_can_purchase(_user_id uuid, _amount_cents integer DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM public.buyer_active_restrictions(_user_id) LOOP
    IF r.kind IN ('frozen','purchase_block') THEN
      RETURN false;
    END IF;
    IF r.kind = 'bid_limit' AND _amount_cents IS NOT NULL
       AND r.cents_limit IS NOT NULL AND _amount_cents > r.cents_limit THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

-- ============================================================================
-- SCORING + RECORDING
-- ============================================================================

CREATE OR REPLACE FUNCTION public._buyer_signal_weight(_kind text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _kind
    WHEN 'payment_failed' THEN 3
    WHEN 'checkout_failed' THEN 1
    WHEN 'order_cancelled_by_buyer' THEN 4
    WHEN 'refund_requested' THEN 3
    WHEN 'dispute_opened' THEN 12
    WHEN 'chargeback' THEN 20
    WHEN 'not_delivered_claim' THEN 8
    WHEN 'bid_retracted' THEN 4
    WHEN 'bid_no_pay' THEN 10
    WHEN 'multi_seller_complaint' THEN 8
    WHEN 'suspicious_activity' THEN 6
    ELSE 2
  END
$$;

CREATE OR REPLACE FUNCTION public.record_buyer_risk_signal(
  _user_id uuid,
  _kind text,
  _ref_table text DEFAULT NULL,
  _ref_id uuid DEFAULT NULL,
  _seller_id uuid DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_weight integer;
  v_score integer;
  v_unique_sellers integer;
  v_existing uuid;
BEGIN
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
$$;

-- ============================================================================
-- ADMIN: apply / clear restriction
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_apply_buyer_restriction(
  _user_id uuid,
  _kind text,
  _reason text,
  _cents_limit integer DEFAULT NULL,
  _expires_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.buyer_restrictions (
    user_id, kind, cents_limit, reason, created_by, expires_at
  ) VALUES (
    _user_id, _kind, _cents_limit, _reason, auth.uid(), _expires_at
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_clear_buyer_restriction(_restriction_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'owner'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.buyer_restrictions
     SET active = false, cleared_at = now(), cleared_by = auth.uid()
   WHERE id = _restriction_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_seller_verified(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.buyer_can_purchase(uuid, integer) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.buyer_active_restrictions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_buyer_risk_signal(uuid, text, text, uuid, uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_apply_buyer_restriction(uuid, text, text, integer, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_clear_buyer_restriction(uuid) TO authenticated;
