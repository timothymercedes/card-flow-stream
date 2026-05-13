-- ============================================================
-- Shipping policy + performance tracking (graduated enforcement)
-- ============================================================

-- 1) ORDERS — shipping SLA tracking
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shipping_due_at        timestamptz,
  ADD COLUMN IF NOT EXISTS is_late_shipment       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_ship_reminder_at  timestamptz,
  ADD COLUMN IF NOT EXISTS ship_reminder_count    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payout_held            boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_orders_shipping_due
  ON public.orders (shipping_due_at)
  WHERE status = 'pending' AND payment_status = 'paid';

-- 2) PROFILES — seller standing
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS late_shipment_count        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payout_hold                boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS selling_restricted_until   timestamptz,
  ADD COLUMN IF NOT EXISTS visibility_penalty_until   timestamptz,
  ADD COLUMN IF NOT EXISTS avg_response_minutes       integer;

-- 3) Business-day helper (skips Sat/Sun; ignores holidays for now)
CREATE OR REPLACE FUNCTION public.add_business_days(_from timestamptz, _days integer)
RETURNS timestamptz
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  d timestamptz := _from;
  added int := 0;
BEGIN
  WHILE added < _days LOOP
    d := d + interval '1 day';
    IF EXTRACT(ISODOW FROM d) < 6 THEN
      added := added + 1;
    END IF;
  END LOOP;
  RETURN d;
END $$;

-- 4) Auto-set shipping_due_at when an order becomes paid
CREATE OR REPLACE FUNCTION public.orders_set_shipping_due()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_status = 'paid' AND NEW.paid_at IS NOT NULL
     AND NEW.shipping_due_at IS NULL
     AND NEW.status = 'pending' THEN
    NEW.shipping_due_at := public.add_business_days(NEW.paid_at, 3);
  END IF;
  -- Clear late flag when shipped
  IF NEW.status IN ('shipped','delivered','cancelled') THEN
    NEW.is_late_shipment := COALESCE(NEW.is_late_shipment, false);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_orders_set_shipping_due ON public.orders;
CREATE TRIGGER trg_orders_set_shipping_due
  BEFORE INSERT OR UPDATE OF payment_status, paid_at, status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_set_shipping_due();

-- Backfill due dates for already-paid pending orders
UPDATE public.orders
   SET shipping_due_at = public.add_business_days(paid_at, 3)
 WHERE payment_status = 'paid'
   AND status = 'pending'
   AND paid_at IS NOT NULL
   AND shipping_due_at IS NULL;

-- 5) Extended seller stats RPC (drop + recreate, signature changes)
DROP FUNCTION IF EXISTS public.get_seller_stats(uuid);
CREATE OR REPLACE FUNCTION public.get_seller_stats(_seller_id uuid)
RETURNS TABLE(
  completed_sales       integer,
  total_sales           integer,
  avg_rating            numeric,
  avg_shipping_rating   numeric,
  review_count          integer,
  avg_shipping_days     numeric,
  success_rate          numeric,
  late_rate             numeric,
  refund_rate           numeric,
  cancel_rate           numeric,
  on_time_rate          numeric,
  avg_response_minutes  integer
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH paid AS (
    SELECT * FROM public.orders
     WHERE seller_id = _seller_id
       AND payment_status IN ('paid','refunded')
  ),
  shipped AS (
    SELECT * FROM paid
     WHERE shipped_at IS NOT NULL AND paid_at IS NOT NULL
  ),
  reviews AS (
    SELECT rating, shipping_rating
      FROM public.seller_reviews
     WHERE seller_id = _seller_id
  )
  SELECT
    (SELECT COUNT(*)::int FROM paid WHERE status IN ('shipped','delivered')) AS completed_sales,
    (SELECT COUNT(*)::int FROM paid)                                          AS total_sales,
    COALESCE((SELECT ROUND(AVG(rating)::numeric, 2)          FROM reviews), 0) AS avg_rating,
    COALESCE((SELECT ROUND(AVG(shipping_rating)::numeric, 2) FROM reviews), 0) AS avg_shipping_rating,
    (SELECT COUNT(*)::int FROM reviews)                                       AS review_count,
    COALESCE((SELECT ROUND(AVG(EXTRACT(EPOCH FROM (shipped_at - paid_at)) / 86400)::numeric, 2)
                FROM shipped), 0)                                              AS avg_shipping_days,
    CASE WHEN (SELECT COUNT(*) FROM paid WHERE status IN ('shipped','delivered','cancelled')) = 0 THEN 0
         ELSE ROUND(100.0 * (SELECT COUNT(*) FROM paid WHERE status = 'delivered')
                          / NULLIF((SELECT COUNT(*) FROM paid WHERE status IN ('shipped','delivered','cancelled')), 0), 1)
    END                                                                       AS success_rate,
    CASE WHEN (SELECT COUNT(*) FROM shipped) = 0 THEN 0
         ELSE ROUND(100.0 * (SELECT COUNT(*) FROM shipped s, paid p WHERE p.id = s.id AND p.shipping_due_at IS NOT NULL AND p.shipped_at > p.shipping_due_at)
                          / (SELECT COUNT(*) FROM shipped), 1)
    END                                                                       AS late_rate,
    CASE WHEN (SELECT COUNT(*) FROM paid) = 0 THEN 0
         ELSE ROUND(100.0 * (SELECT COUNT(*) FROM paid WHERE refunded_at IS NOT NULL)
                          / (SELECT COUNT(*) FROM paid), 1)
    END                                                                       AS refund_rate,
    CASE WHEN (SELECT COUNT(*) FROM paid) = 0 THEN 0
         ELSE ROUND(100.0 * (SELECT COUNT(*) FROM paid WHERE status = 'cancelled')
                          / (SELECT COUNT(*) FROM paid), 1)
    END                                                                       AS cancel_rate,
    CASE WHEN (SELECT COUNT(*) FROM shipped) = 0 THEN 100
         ELSE ROUND(100.0 - (100.0 * (SELECT COUNT(*) FROM shipped s, paid p WHERE p.id = s.id AND p.shipping_due_at IS NOT NULL AND p.shipped_at > p.shipping_due_at)
                                   / (SELECT COUNT(*) FROM shipped)), 1)
    END                                                                       AS on_time_rate,
    (SELECT avg_response_minutes FROM public.profiles WHERE id = _seller_id)  AS avg_response_minutes;
$$;

-- 6) Badges helper — derives Fast Shipper, Same Day, Trusted, Verified from stats
CREATE OR REPLACE FUNCTION public.get_seller_badges(_seller_id uuid)
RETURNS TABLE(badge text, label text, tier text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _s record; _verified boolean; _live_verified boolean;
BEGIN
  SELECT * INTO _s FROM public.get_seller_stats(_seller_id);
  SELECT (verification_status = 'verified'), live_verified
    INTO _verified, _live_verified
  FROM public.profiles WHERE id = _seller_id;

  IF COALESCE(_verified, false) OR COALESCE(_live_verified, false) THEN
    badge := 'verified'; label := 'Verified Seller'; tier := 'gold'; RETURN NEXT;
  END IF;

  IF _s.completed_sales >= 25 AND _s.avg_rating >= 4.5 AND _s.success_rate >= 95
     AND _s.late_rate <= 5 AND _s.refund_rate <= 3 THEN
    badge := 'trusted'; label := 'Trusted Seller'; tier := 'gold'; RETURN NEXT;
  END IF;

  IF _s.completed_sales >= 10 AND _s.avg_shipping_days IS NOT NULL AND _s.avg_shipping_days <= 1 THEN
    badge := 'same_day'; label := 'Same-Day Shipper'; tier := 'platinum'; RETURN NEXT;
  ELSIF _s.completed_sales >= 5 AND _s.avg_shipping_days IS NOT NULL AND _s.avg_shipping_days <= 2 THEN
    badge := 'fast'; label := 'Fast Shipper'; tier := 'silver'; RETURN NEXT;
  END IF;

  IF _s.review_count >= 10 AND _s.avg_rating >= 4.7 THEN
    badge := 'top_rated'; label := 'Top Rated'; tier := 'gold'; RETURN NEXT;
  END IF;

  RETURN;
END $$;

-- 7) Graduated late-shipment enforcement
--    Stage A: 3 business days  → reminder
--    Stage B: 6 business days  → warning + late flag + late count++
--    Stage C: 9 business days  → payout hold + visibility penalty 14d
--    Stage D: 14 business days → flag for admin review (selling restriction)
CREATE OR REPLACE FUNCTION public.enforce_late_shipments()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _stage_a int := 0; _stage_b int := 0; _stage_c int := 0; _stage_d int := 0;
  _o record;
  _b6  timestamptz;
  _b9  timestamptz;
  _b14 timestamptz;
BEGIN
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
END $$;

GRANT EXECUTE ON FUNCTION public.enforce_late_shipments() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_seller_stats(uuid)   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_seller_badges(uuid)  TO anon, authenticated;