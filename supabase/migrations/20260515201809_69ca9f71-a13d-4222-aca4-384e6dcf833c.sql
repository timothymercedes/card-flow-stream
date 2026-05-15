
-- ============================================================
-- SELLER TRUST + PAYOUT PROTECTION
-- ============================================================

-- Trust tier enum
DO $$ BEGIN
  CREATE TYPE public.seller_trust_tier AS ENUM ('new','bronze','silver','gold','platinum');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- seller_trust ----------
CREATE TABLE IF NOT EXISTS public.seller_trust (
  user_id UUID PRIMARY KEY,
  completed_deliveries INTEGER NOT NULL DEFAULT 0,
  tier public.seller_trust_tier NOT NULL DEFAULT 'new',
  instant_release_pct INTEGER NOT NULL DEFAULT 0 CHECK (instant_release_pct BETWEEN 0 AND 100),
  pending_release_pct INTEGER NOT NULL DEFAULT 100 CHECK (pending_release_pct BETWEEN 0 AND 100),
  manual_override_pct INTEGER CHECK (manual_override_pct IS NULL OR manual_override_pct BETWEEN 0 AND 100),
  frozen BOOLEAN NOT NULL DEFAULT FALSE,
  dispute_rate_30d NUMERIC(5,4) NOT NULL DEFAULT 0,
  chargeback_rate_30d NUMERIC(5,4) NOT NULL DEFAULT 0,
  risk_flags JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.seller_trust ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users view own trust" ON public.seller_trust;
CREATE POLICY "users view own trust" ON public.seller_trust
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "staff view all trust" ON public.seller_trust;
CREATE POLICY "staff view all trust" ON public.seller_trust
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR
    public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'support')
  );

-- ---------- payout_locks ----------
CREATE TABLE IF NOT EXISTS public.payout_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL,
  user_id UUID NOT NULL,
  amount_cents BIGINT NOT NULL DEFAULT 0,
  reason TEXT NOT NULL CHECK (reason IN ('dispute','refund_pending','fraud_review','delivery_unconfirmed','chargeback','admin_hold')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at TIMESTAMPTZ,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_payout_locks_user_active
  ON public.payout_locks(user_id) WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payout_locks_order
  ON public.payout_locks(order_id) WHERE released_at IS NULL;

ALTER TABLE public.payout_locks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users view own locks" ON public.payout_locks;
CREATE POLICY "users view own locks" ON public.payout_locks
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "staff view all locks" ON public.payout_locks;
CREATE POLICY "staff view all locks" ON public.payout_locks
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR
    public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'support')
  );

-- ---------- balance_audit_log (immutable) ----------
CREATE TABLE IF NOT EXISTS public.balance_audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  delta_cents BIGINT NOT NULL,
  balance_before BIGINT,
  balance_after BIGINT,
  reference_table TEXT,
  reference_id TEXT,
  actor_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_balance_audit_user
  ON public.balance_audit_log(user_id, created_at DESC);

ALTER TABLE public.balance_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users view own ledger" ON public.balance_audit_log;
CREATE POLICY "users view own ledger" ON public.balance_audit_log
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "staff view all ledger" ON public.balance_audit_log;
CREATE POLICY "staff view all ledger" ON public.balance_audit_log
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR
    public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'support')
  );

-- Block tampering
CREATE OR REPLACE FUNCTION public.block_balance_audit_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'balance_audit_log is immutable'; END $$;

DROP TRIGGER IF EXISTS trg_balance_audit_no_update ON public.balance_audit_log;
CREATE TRIGGER trg_balance_audit_no_update BEFORE UPDATE OR DELETE ON public.balance_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.block_balance_audit_mutation();

-- ---------- fraud_flags ----------
CREATE TABLE IF NOT EXISTS public.fraud_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  flag_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'low' CHECK (severity IN ('low','medium','high','critical')),
  auto_action TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fraud_flags_user ON public.fraud_flags(user_id, created_at DESC);
ALTER TABLE public.fraud_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff view fraud" ON public.fraud_flags;
CREATE POLICY "staff view fraud" ON public.fraud_flags
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR
    public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'support')
  );

-- ============================================================
-- RPCs
-- ============================================================

CREATE OR REPLACE FUNCTION public.recalc_seller_trust(_user_id UUID)
RETURNS public.seller_trust LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _delivered INTEGER;
  _tier public.seller_trust_tier;
  _instant INTEGER;
  _row public.seller_trust;
BEGIN
  SELECT COUNT(*) INTO _delivered FROM public.orders
   WHERE seller_id = _user_id
     AND status = 'delivered'
     AND payment_status = 'paid'
     AND COALESCE(refunded_amount,0) = 0;

  IF _delivered >= 100 THEN _tier := 'platinum'; _instant := 95;
  ELSIF _delivered >= 75 THEN _tier := 'gold'; _instant := 70;
  ELSIF _delivered >= 50 THEN _tier := 'silver'; _instant := 30;
  ELSIF _delivered >= 25 THEN _tier := 'bronze'; _instant := 10;
  ELSE _tier := 'new'; _instant := 0;
  END IF;

  INSERT INTO public.seller_trust (user_id, completed_deliveries, tier, instant_release_pct, pending_release_pct, updated_at)
  VALUES (_user_id, _delivered, _tier, _instant, 100 - _instant, now())
  ON CONFLICT (user_id) DO UPDATE
    SET completed_deliveries = EXCLUDED.completed_deliveries,
        tier = EXCLUDED.tier,
        instant_release_pct = EXCLUDED.instant_release_pct,
        pending_release_pct = EXCLUDED.pending_release_pct,
        updated_at = now()
  RETURNING * INTO _row;

  RETURN _row;
END $$;
GRANT EXECUTE ON FUNCTION public.recalc_seller_trust(UUID) TO authenticated;

-- compute payable: returns cents the seller may currently withdraw
CREATE OR REPLACE FUNCTION public.compute_seller_payable(_user_id UUID)
RETURNS TABLE (
  available_cents BIGINT,
  pending_cents BIGINT,
  locked_cents BIGINT,
  in_flight_cents BIGINT,
  owed_cents BIGINT,
  payable_cents BIGINT,
  instant_pct INTEGER,
  tier public.seller_trust_tier,
  frozen BOOLEAN
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _trust public.seller_trust;
  _instant INTEGER;
  _delivered_net BIGINT := 0;
  _undelivered_net BIGINT := 0;
  _instant_from_pending BIGINT := 0;
  _locked BIGINT := 0;
  _inflight BIGINT := 0;
  _owed BIGINT := 0;
BEGIN
  -- Ensure trust row
  PERFORM public.recalc_seller_trust(_user_id);
  SELECT * INTO _trust FROM public.seller_trust WHERE user_id = _user_id;
  _instant := COALESCE(_trust.manual_override_pct, _trust.instant_release_pct);

  -- Net = seller_payout_amount when present, else amount * (1 - commission_rate)
  -- Delivered & paid & not refunded
  SELECT COALESCE(SUM(
    CASE WHEN seller_payout_amount IS NOT NULL THEN (seller_payout_amount * 100)::bigint
         ELSE (amount * (1 - COALESCE(commission_rate,0.05)) * 100)::bigint END
  ),0) INTO _delivered_net
  FROM public.orders
  WHERE seller_id = _user_id
    AND status = 'delivered'
    AND payment_status = 'paid'
    AND COALESCE(refunded_amount,0) = 0
    AND payout_held = false;

  -- Pending (paid but not delivered) — fraction of these are instantly released by tier
  SELECT COALESCE(SUM(
    CASE WHEN seller_payout_amount IS NOT NULL THEN (seller_payout_amount * 100)::bigint
         ELSE (amount * (1 - COALESCE(commission_rate,0.05)) * 100)::bigint END
  ),0) INTO _undelivered_net
  FROM public.orders
  WHERE seller_id = _user_id
    AND status IN ('pending','shipped')
    AND payment_status = 'paid'
    AND COALESCE(refunded_amount,0) = 0
    AND payout_held = false
    AND id NOT IN (SELECT order_id FROM public.payout_locks WHERE released_at IS NULL);

  _instant_from_pending := (_undelivered_net * _instant) / 100;

  -- Active locks
  SELECT COALESCE(SUM(amount_cents),0) INTO _locked
    FROM public.payout_locks WHERE user_id = _user_id AND released_at IS NULL;

  -- In-flight payouts
  SELECT COALESCE(SUM(amount_cents),0) INTO _inflight
    FROM public.payout_requests
    WHERE user_id = _user_id AND status IN ('requested','processing');

  -- Owed (active hold)
  SELECT COALESCE(SUM(balance_owed_cents),0) INTO _owed
    FROM public.account_holds WHERE user_id = _user_id AND status = 'active';

  available_cents := _delivered_net + _instant_from_pending;
  pending_cents   := _undelivered_net - _instant_from_pending;
  locked_cents    := _locked;
  in_flight_cents := _inflight;
  owed_cents      := _owed;
  payable_cents   := GREATEST(0, available_cents - _inflight - _owed);
  IF COALESCE(_trust.frozen,false) THEN payable_cents := 0; END IF;
  instant_pct := _instant;
  tier := _trust.tier;
  frozen := COALESCE(_trust.frozen,false);
  RETURN NEXT;
END $$;
GRANT EXECUTE ON FUNCTION public.compute_seller_payable(UUID) TO authenticated;

-- Lock / release order funds
CREATE OR REPLACE FUNCTION public.lock_order_funds(_order_id UUID, _reason TEXT, _notes TEXT DEFAULT NULL)
RETURNS public.payout_locks LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _o public.orders; _amt BIGINT; _row public.payout_locks;
BEGIN
  SELECT * INTO _o FROM public.orders WHERE id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  _amt := COALESCE(
    (_o.seller_payout_amount * 100)::bigint,
    (_o.amount * (1 - COALESCE(_o.commission_rate,0.05)) * 100)::bigint
  );
  -- Avoid duplicate active lock per (order, reason)
  SELECT * INTO _row FROM public.payout_locks
   WHERE order_id = _order_id AND reason = _reason AND released_at IS NULL LIMIT 1;
  IF FOUND THEN RETURN _row; END IF;

  INSERT INTO public.payout_locks (order_id, user_id, amount_cents, reason, notes)
  VALUES (_order_id, _o.seller_id, _amt, _reason, _notes)
  RETURNING * INTO _row;
  RETURN _row;
END $$;
GRANT EXECUTE ON FUNCTION public.lock_order_funds(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.release_order_funds(_order_id UUID, _reason TEXT DEFAULT NULL)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n INTEGER;
BEGIN
  UPDATE public.payout_locks SET released_at = now()
   WHERE order_id = _order_id AND released_at IS NULL
     AND (_reason IS NULL OR reason = _reason);
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;
GRANT EXECUTE ON FUNCTION public.release_order_funds(UUID, TEXT) TO authenticated;

-- Replace request_payout with race-safe, server-validated version
CREATE OR REPLACE FUNCTION public.request_payout(_amount_cents INTEGER)
RETURNS public.payout_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid UUID := auth.uid();
  _existing UUID;
  _payable BIGINT;
  _row public.payout_requests;
  _bal_before BIGINT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _amount_cents IS NULL OR _amount_cents <= 0 THEN RAISE EXCEPTION 'Invalid payout amount'; END IF;

  -- Per-user advisory lock prevents concurrent payout requests across tabs/clients
  PERFORM pg_advisory_xact_lock(hashtext('payout:' || _uid::text));

  SELECT id INTO _existing FROM public.payout_requests
   WHERE user_id = _uid AND status IN ('requested','processing') LIMIT 1;
  IF _existing IS NOT NULL THEN RAISE EXCEPTION 'A payout is already in progress'; END IF;

  -- Re-validate payable server-side
  SELECT payable_cents INTO _payable FROM public.compute_seller_payable(_uid);
  IF _amount_cents > _payable THEN
    RAISE EXCEPTION 'Requested amount exceeds available balance ($ %)', (_payable::numeric/100);
  END IF;

  SELECT COALESCE(balance_cents,0) INTO _bal_before FROM public.profiles WHERE id = _uid;

  INSERT INTO public.payout_requests(user_id, amount_cents, status)
  VALUES (_uid, _amount_cents, 'processing') RETURNING * INTO _row;

  INSERT INTO public.balance_audit_log(user_id, event_type, delta_cents, balance_before, balance_after, reference_table, reference_id, metadata)
  VALUES (_uid, 'payout_requested', -_amount_cents, _bal_before, _bal_before, 'payout_requests', _row.id::text, jsonb_build_object('status','processing'));

  RETURN _row;
END $$;
GRANT EXECUTE ON FUNCTION public.request_payout(INTEGER) TO authenticated;

-- Admin overrides (audited)
CREATE OR REPLACE FUNCTION public.admin_override_trust(
  _user_id UUID, _instant_pct INTEGER, _frozen BOOLEAN, _reason TEXT
) RETURNS public.seller_trust LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.seller_trust;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _instant_pct IS NOT NULL AND (_instant_pct < 0 OR _instant_pct > 100) THEN
    RAISE EXCEPTION 'invalid pct';
  END IF;
  PERFORM public.recalc_seller_trust(_user_id);
  UPDATE public.seller_trust
     SET manual_override_pct = _instant_pct,
         frozen = COALESCE(_frozen, frozen),
         updated_at = now()
   WHERE user_id = _user_id
   RETURNING * INTO _row;

  INSERT INTO public.balance_audit_log(user_id, event_type, delta_cents, actor_id, metadata)
  VALUES (_user_id, 'admin_override_trust', 0, auth.uid(),
          jsonb_build_object('instant_pct', _instant_pct, 'frozen', _frozen, 'reason', _reason));
  RETURN _row;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_override_trust(UUID, INTEGER, BOOLEAN, TEXT) TO authenticated;

-- ============================================================
-- Order trigger: keep trust + locks in sync
-- ============================================================
CREATE OR REPLACE FUNCTION public.orders_protect_payouts()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Lock if delivery still unconfirmed past shipping_due_at
  IF NEW.payment_status = 'paid' AND NEW.status = 'pending' AND NEW.shipping_due_at IS NOT NULL
     AND NEW.shipping_due_at < now() THEN
    PERFORM public.lock_order_funds(NEW.id, 'delivery_unconfirmed', 'past shipping due');
  END IF;

  -- Refund => lock until reconciled, recalc trust
  IF (TG_OP = 'UPDATE') AND COALESCE(OLD.refunded_amount,0) = 0 AND COALESCE(NEW.refunded_amount,0) > 0 THEN
    PERFORM public.lock_order_funds(NEW.id, 'refund_pending', 'refund issued');
    PERFORM public.recalc_seller_trust(NEW.seller_id);
  END IF;

  -- Delivered => release any delivery_unconfirmed locks + recalc
  IF (TG_OP = 'UPDATE') AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'delivered' THEN
    PERFORM public.release_order_funds(NEW.id, 'delivery_unconfirmed');
    PERFORM public.recalc_seller_trust(NEW.seller_id);
  END IF;

  -- Cancelled => release locks + recalc
  IF (TG_OP = 'UPDATE') AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'cancelled' THEN
    PERFORM public.release_order_funds(NEW.id);
    PERFORM public.recalc_seller_trust(NEW.seller_id);
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_orders_protect_payouts ON public.orders;
CREATE TRIGGER trg_orders_protect_payouts
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_protect_payouts();
