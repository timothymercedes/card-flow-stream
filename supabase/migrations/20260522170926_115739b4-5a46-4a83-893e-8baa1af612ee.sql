
-- ============================================================
-- Shipping lifecycle + payout protection
-- ============================================================

-- 1. Enum
DO $$ BEGIN
  CREATE TYPE public.shipping_status AS ENUM (
    'pending_shipment',
    'label_created',
    'shipped',
    'in_transit',
    'delivered',
    'delivery_failed',
    'returned',
    'lost_package'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Columns on orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shipping_status public.shipping_status NOT NULL DEFAULT 'pending_shipment',
  ADD COLUMN IF NOT EXISTS label_purchased_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_scan_at timestamptz,
  ADD COLUMN IF NOT EXISTS payout_eligible_at timestamptz,
  ADD COLUMN IF NOT EXISTS lost_marked_at timestamptz,
  ADD COLUMN IF NOT EXISTS payout_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS payout_paid_amount_cents integer;

CREATE INDEX IF NOT EXISTS idx_orders_shipping_status ON public.orders(shipping_status);
CREATE INDEX IF NOT EXISTS idx_orders_payout_eligible ON public.orders(seller_id, payout_eligible_at)
  WHERE payout_eligible_at IS NOT NULL AND payout_paid_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_label_no_scan ON public.orders(seller_id, label_purchased_at)
  WHERE shipping_status = 'label_created' AND first_scan_at IS NULL;

-- 3. Backfill shipping_status from legacy data
UPDATE public.orders SET shipping_status = CASE
  WHEN delivered_at IS NOT NULL THEN 'delivered'::public.shipping_status
  WHEN status = 'shipped' AND tracking_number IS NOT NULL THEN 'shipped'::public.shipping_status
  WHEN tracking_number IS NOT NULL THEN 'label_created'::public.shipping_status
  ELSE 'pending_shipment'::public.shipping_status
END
WHERE shipping_status = 'pending_shipment'
  AND (delivered_at IS NOT NULL OR tracking_number IS NOT NULL);

UPDATE public.orders SET label_purchased_at = COALESCE(shipped_at, created_at)
WHERE label_purchased_at IS NULL AND tracking_number IS NOT NULL;

-- For historical orders that were already marked delivered, grant payout eligibility immediately
UPDATE public.orders SET payout_eligible_at = COALESCE(delivered_at, shipped_at)
WHERE payout_eligible_at IS NULL
  AND shipping_status IN ('delivered','shipped','in_transit')
  AND payment_status = 'paid'
  AND COALESCE(refunded_amount, 0) = 0;

-- 4. shipment_events audit table
CREATE TABLE IF NOT EXISTS public.shipment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  shipping_status public.shipping_status,
  source text NOT NULL DEFAULT 'system',
  tracking_status text,
  location text,
  message text,
  raw jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shipment_events_order ON public.shipment_events(order_id, occurred_at DESC);
ALTER TABLE public.shipment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Buyers and sellers view own shipment events"
  ON public.shipment_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = shipment_events.order_id
      AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid())
  ));

CREATE POLICY "Staff view all shipment events"
  ON public.shipment_events FOR SELECT
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'owner'::app_role)
         OR has_role(auth.uid(),'moderator'::app_role) OR has_role(auth.uid(),'support'::app_role));

-- 5. Helper to set shipping_status + cascade payout eligibility
CREATE OR REPLACE FUNCTION public.set_order_shipping_status(
  _order_id uuid,
  _status public.shipping_status,
  _source text DEFAULT 'system',
  _tracking_status text DEFAULT NULL,
  _location text DEFAULT NULL,
  _message text DEFAULT NULL,
  _raw jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o public.orders%ROWTYPE;
BEGIN
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
END$$;

-- 6. Available-for-payout view
CREATE OR REPLACE VIEW public.v_seller_available_balance AS
SELECT
  seller_id,
  COALESCE(SUM(
    GREATEST(0,
      COALESCE(seller_payout_amount,0) * 100
      - COALESCE(payout_paid_amount_cents, 0)
    )::numeric
  ), 0)::bigint AS available_cents,
  COUNT(*) FILTER (WHERE payout_eligible_at <= now()) AS eligible_orders
FROM public.orders
WHERE payment_status = 'paid'
  AND COALESCE(refunded_amount, 0) = 0
  AND payout_eligible_at IS NOT NULL
  AND payout_eligible_at <= now()
  AND payout_paid_at IS NULL
GROUP BY seller_id;

GRANT SELECT ON public.v_seller_available_balance TO authenticated;

-- 7. Block payout requests above available balance + while suspicious activity
CREATE OR REPLACE FUNCTION public.assert_payout_within_available_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_available bigint;
  v_unscanned_count int;
  v_active_hold int;
BEGIN
  -- Block if active account hold
  SELECT COUNT(*) INTO v_active_hold
  FROM public.account_holds
  WHERE user_id = NEW.user_id AND status = 'active';
  IF v_active_hold > 0 THEN
    RAISE EXCEPTION 'Payouts are paused: your account has an active hold. Contact support.';
  END IF;

  -- Block if any label-created order over 5 days without scan
  SELECT COUNT(*) INTO v_unscanned_count
  FROM public.orders
  WHERE seller_id = NEW.user_id
    AND shipping_status = 'label_created'
    AND first_scan_at IS NULL
    AND label_purchased_at < now() - interval '5 days';
  IF v_unscanned_count > 0 THEN
    RAISE EXCEPTION 'You have % shipment(s) where the carrier never scanned the label. Drop them off or void them before requesting payout.', v_unscanned_count;
  END IF;

  -- Check available balance
  SELECT COALESCE(available_cents, 0) INTO v_available
  FROM public.v_seller_available_balance
  WHERE seller_id = NEW.user_id;

  IF NEW.amount_cents > COALESCE(v_available, 0) THEN
    RAISE EXCEPTION 'Requested % cents exceeds available balance % cents. Funds are held until carrier confirmation.', NEW.amount_cents, COALESCE(v_available,0);
  END IF;

  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_payout_within_balance ON public.payout_requests;
CREATE TRIGGER trg_payout_within_balance
  BEFORE INSERT ON public.payout_requests
  FOR EACH ROW EXECUTE FUNCTION public.assert_payout_within_available_balance();

-- 8. When a payout completes, mark orders as paid out (oldest-first FIFO)
CREATE OR REPLACE FUNCTION public.allocate_payout_to_orders(
  _user_id uuid, _amount_cents int, _completed_at timestamptz DEFAULT now()
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  remaining int := _amount_cents;
  r record;
  order_share int;
BEGIN
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
END$$;

-- 9. Refund / dispute reversal: when refunded_amount goes up, revoke eligibility
CREATE OR REPLACE FUNCTION public.orders_revoke_payout_on_refund()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF COALESCE(NEW.refunded_amount,0) > COALESCE(OLD.refunded_amount,0)
     AND COALESCE(NEW.refunded_amount,0) >= COALESCE(NEW.amount,0) THEN
    NEW.payout_eligible_at := NULL;
  END IF;
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_orders_revoke_payout_on_refund ON public.orders;
CREATE TRIGGER trg_orders_revoke_payout_on_refund
  BEFORE UPDATE OF refunded_amount ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_revoke_payout_on_refund();

-- 10. Seller shipping analytics materialized view
DROP MATERIALIZED VIEW IF EXISTS public.mv_seller_shipping_analytics;
CREATE MATERIALIZED VIEW public.mv_seller_shipping_analytics AS
SELECT
  seller_id,
  COUNT(*) FILTER (WHERE payment_status='paid') AS total_orders,
  COUNT(*) FILTER (WHERE shipping_status='delivered') AS delivered_count,
  COUNT(*) FILTER (WHERE shipping_status='lost_package') AS lost_count,
  COUNT(*) FILTER (WHERE shipping_status='returned') AS returned_count,
  COUNT(*) FILTER (WHERE is_late_shipment) AS late_count,
  AVG(EXTRACT(EPOCH FROM (label_purchased_at - paid_at))/3600.0)
    FILTER (WHERE label_purchased_at IS NOT NULL AND paid_at IS NOT NULL) AS avg_hours_paid_to_label,
  AVG(EXTRACT(EPOCH FROM (first_scan_at - label_purchased_at))/3600.0)
    FILTER (WHERE first_scan_at IS NOT NULL AND label_purchased_at IS NOT NULL) AS avg_hours_label_to_scan,
  AVG(EXTRACT(EPOCH FROM (delivered_at - first_scan_at))/3600.0)
    FILTER (WHERE delivered_at IS NOT NULL AND first_scan_at IS NOT NULL) AS avg_hours_scan_to_delivered,
  CASE WHEN COUNT(*) FILTER (WHERE payment_status='paid') > 0
       THEN ROUND(100.0 * COUNT(*) FILTER (WHERE shipping_status='delivered')
                  / NULLIF(COUNT(*) FILTER (WHERE payment_status='paid'),0), 2)
       ELSE NULL END AS delivery_success_pct,
  CASE WHEN COUNT(*) FILTER (WHERE payment_status='paid') > 0
       THEN ROUND(100.0 * COUNT(*) FILTER (WHERE shipping_status='lost_package')
                  / NULLIF(COUNT(*) FILTER (WHERE payment_status='paid'),0), 2)
       ELSE NULL END AS lost_pct,
  CASE WHEN COUNT(*) FILTER (WHERE payment_status='paid') > 0
       THEN ROUND(100.0 * COUNT(*) FILTER (WHERE is_late_shipment)
                  / NULLIF(COUNT(*) FILTER (WHERE payment_status='paid'),0), 2)
       ELSE NULL END AS late_pct,
  now() AS refreshed_at
FROM public.orders
GROUP BY seller_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_seller_shipping ON public.mv_seller_shipping_analytics(seller_id);
GRANT SELECT ON public.mv_seller_shipping_analytics TO authenticated;

CREATE OR REPLACE FUNCTION public.refresh_seller_shipping_analytics() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_seller_shipping_analytics;
$$;
