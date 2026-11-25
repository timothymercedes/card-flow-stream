CREATE OR REPLACE FUNCTION public.fee_week_start(_at timestamptz)
RETURNS timestamptz LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT (date_trunc('week', _at AT TIME ZONE 'America/New_York')) AT TIME ZONE 'America/New_York'
$$;

CREATE TABLE public.seller_weekly_sales_tracker (
  seller_id uuid NOT NULL,
  week_start timestamptz NOT NULL,
  cumulative_sales_cents bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (seller_id, week_start)
);
GRANT SELECT ON public.seller_weekly_sales_tracker TO authenticated;
GRANT ALL ON public.seller_weekly_sales_tracker TO service_role;
ALTER TABLE public.seller_weekly_sales_tracker ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sellers view own weekly tracker" ON public.seller_weekly_sales_tracker FOR SELECT TO authenticated
  USING (seller_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner'));

CREATE TABLE public.seller_commission_allocations (
  order_id uuid PRIMARY KEY,
  seller_id uuid NOT NULL,
  week_start timestamptz NOT NULL,
  sale_cents bigint NOT NULL CHECK (sale_cents >= 0),
  prior_sales_cents bigint NOT NULL,
  commission_cents bigint NOT NULL CHECK (commission_cents >= 0),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','confirmed','released')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX seller_commission_allocations_seller_week_idx ON public.seller_commission_allocations (seller_id, week_start);
GRANT SELECT ON public.seller_commission_allocations TO authenticated;
GRANT ALL ON public.seller_commission_allocations TO service_role;
ALTER TABLE public.seller_commission_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sellers view own commission allocations" ON public.seller_commission_allocations FOR SELECT TO authenticated
  USING (seller_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner'));

CREATE TABLE public.seller_weekly_vip_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL,
  week_start timestamptz NOT NULL,
  week_end timestamptz NOT NULL,
  review_deadline timestamptz NOT NULL,
  total_paid_sales_cents bigint NOT NULL DEFAULT 0,
  verified_delivered_cents bigint NOT NULL DEFAULT 0,
  pending_delivery_cents bigint NOT NULL DEFAULT 0,
  disputed_excluded_cents bigint NOT NULL DEFAULT 0,
  eligible_vip_sales_cents bigint NOT NULL DEFAULT 0,
  total_orders_count int NOT NULL DEFAULT 0,
  delivered_orders_count int NOT NULL DEFAULT 0,
  active_disputes_count int NOT NULL DEFAULT 0,
  delivery_performance_pct numeric(5,2) NOT NULL DEFAULT 0,
  standard_commission_cents bigint NOT NULL DEFAULT 0,
  potential_vip_rebate_cents bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress','pending_review','not_qualified','approved','rejected')),
  rejection_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  notes text,
  last_calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_seller_weekly_vip_review UNIQUE (seller_id, week_start)
);
CREATE INDEX seller_weekly_vip_reviews_status_idx ON public.seller_weekly_vip_reviews (status, week_start);
GRANT SELECT ON public.seller_weekly_vip_reviews TO authenticated;
GRANT ALL ON public.seller_weekly_vip_reviews TO service_role;
ALTER TABLE public.seller_weekly_vip_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sellers view own VIP reviews" ON public.seller_weekly_vip_reviews FOR SELECT TO authenticated
  USING (seller_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner'));

CREATE TABLE public.seller_vip_review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.seller_weekly_vip_reviews(id),
  actor_id uuid,
  action text NOT NULL,
  reason text,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX seller_vip_review_events_review_idx ON public.seller_vip_review_events (review_id);
GRANT SELECT ON public.seller_vip_review_events TO authenticated;
GRANT ALL ON public.seller_vip_review_events TO service_role;
ALTER TABLE public.seller_vip_review_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view VIP review events" ON public.seller_vip_review_events FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner'));

CREATE TABLE public.seller_commission_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL,
  review_id uuid REFERENCES public.seller_weekly_vip_reviews(id),
  order_id uuid,
  adjustment_type text NOT NULL CHECK (adjustment_type IN ('vip_credit','dispute_reconsideration','manual_credit','manual_debit')),
  amount_cents bigint NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) >= 3),
  admin_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX seller_commission_adjustments_seller_idx ON public.seller_commission_adjustments (seller_id, created_at DESC);
CREATE INDEX seller_commission_adjustments_review_idx ON public.seller_commission_adjustments (review_id);
CREATE INDEX seller_commission_adjustments_order_idx ON public.seller_commission_adjustments (order_id);
CREATE UNIQUE INDEX uq_vip_review_adjustment ON public.seller_commission_adjustments (review_id) WHERE adjustment_type = 'vip_credit';
GRANT SELECT ON public.seller_commission_adjustments TO authenticated;
GRANT ALL ON public.seller_commission_adjustments TO service_role;
ALTER TABLE public.seller_commission_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sellers view own commission adjustments" ON public.seller_commission_adjustments FOR SELECT TO authenticated
  USING (seller_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner'));

CREATE OR REPLACE FUNCTION public.block_commission_ledger_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME; END $$;
CREATE TRIGGER seller_commission_adjustments_append_only BEFORE UPDATE OR DELETE ON public.seller_commission_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.block_commission_ledger_mutation();
CREATE TRIGGER seller_vip_review_events_append_only BEFORE UPDATE OR DELETE ON public.seller_vip_review_events
  FOR EACH ROW EXECUTE FUNCTION public.block_commission_ledger_mutation();

CREATE OR REPLACE FUNCTION public.order_merch_cents(_amount numeric, _shipping numeric)
RETURNS bigint LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT GREATEST(0, round(coalesce(_amount,0)*100)::bigint - round(coalesce(_shipping,0)*100)::bigint)
$$;

CREATE OR REPLACE FUNCTION public.allocate_seller_weekly_commission(_order_id uuid, _seller_id uuid, _sale_cents bigint, _at timestamptz DEFAULT now())
RETURNS TABLE (prior_sales_cents bigint, commission_cents bigint, new_cumulative_cents bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_week timestamptz := public.fee_week_start(_at);
  v_existing public.seller_commission_allocations%ROWTYPE;
  v_prior bigint; v_room bigint; v_base bigint; v_comm bigint;
BEGIN
  IF _sale_cents < 0 THEN RAISE EXCEPTION 'sale must be non-negative'; END IF;
  INSERT INTO public.seller_weekly_sales_tracker (seller_id, week_start, cumulative_sales_cents)
  SELECT _seller_id, v_week, coalesce(sum(public.order_merch_cents(o.amount, o.shipping_amount)),0)
  FROM public.orders o LEFT JOIN public.listings l ON l.id = o.listing_id
  WHERE o.seller_id = _seller_id AND o.payment_status = 'paid'
    AND o.paid_at >= v_week AND o.paid_at < v_week + interval '7 days'
    AND (l.channel IS NULL OR l.channel = 'marketplace')
    AND o.refunded_at IS NULL AND coalesce(o.status,'') NOT IN ('cancelled','canceled','refunded')
    AND NOT EXISTS (SELECT 1 FROM public.seller_commission_allocations a WHERE a.order_id = o.id)
  ON CONFLICT (seller_id, week_start) DO NOTHING;

  SELECT t.cumulative_sales_cents INTO v_prior FROM public.seller_weekly_sales_tracker t
  WHERE t.seller_id = _seller_id AND t.week_start = v_week FOR UPDATE;

  SELECT * INTO v_existing FROM public.seller_commission_allocations WHERE order_id = _order_id FOR UPDATE;
  IF FOUND AND v_existing.status <> 'released' THEN
    RETURN QUERY SELECT v_existing.prior_sales_cents, v_existing.commission_cents, v_prior; RETURN;
  END IF;

  v_room := GREATEST(0, 50000 - v_prior);
  v_base := LEAST(_sale_cents, v_room);
  v_comm := round(v_base * 0.05 + (_sale_cents - v_base) * 0.08)::bigint;

  INSERT INTO public.seller_commission_allocations (order_id, seller_id, week_start, sale_cents, prior_sales_cents, commission_cents, status)
  VALUES (_order_id, _seller_id, v_week, _sale_cents, v_prior, v_comm, 'reserved')
  ON CONFLICT (order_id) DO UPDATE SET seller_id = EXCLUDED.seller_id, week_start = EXCLUDED.week_start,
    sale_cents = EXCLUDED.sale_cents, prior_sales_cents = EXCLUDED.prior_sales_cents,
    commission_cents = EXCLUDED.commission_cents, status = 'reserved', updated_at = now();

  UPDATE public.seller_weekly_sales_tracker SET cumulative_sales_cents = v_prior + _sale_cents, updated_at = now()
  WHERE seller_id = _seller_id AND week_start = v_week;
  RETURN QUERY SELECT v_prior, v_comm, v_prior + _sale_cents;
END $$;
REVOKE ALL ON FUNCTION public.allocate_seller_weekly_commission(uuid, uuid, bigint, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_seller_weekly_commission(uuid, uuid, bigint, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_commission_allocation_from_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.seller_commission_allocations%ROWTYPE;
BEGIN
  IF NEW.payment_status IS NOT DISTINCT FROM OLD.payment_status THEN RETURN NEW; END IF;
  SELECT * INTO a FROM public.seller_commission_allocations WHERE order_id = NEW.id FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF NEW.payment_status = 'paid' AND a.status = 'reserved' THEN
    UPDATE public.seller_commission_allocations SET status = 'confirmed', updated_at = now() WHERE order_id = NEW.id;
  ELSIF NEW.payment_status IN ('cancelled','canceled','expired','failed') AND a.status = 'reserved' AND OLD.payment_status <> 'paid' THEN
    PERFORM 1 FROM public.seller_weekly_sales_tracker WHERE seller_id = a.seller_id AND week_start = a.week_start FOR UPDATE;
    UPDATE public.seller_weekly_sales_tracker SET cumulative_sales_cents = GREATEST(0, cumulative_sales_cents - a.sale_cents), updated_at = now()
      WHERE seller_id = a.seller_id AND week_start = a.week_start;
    UPDATE public.seller_commission_allocations SET status = 'released', updated_at = now() WHERE order_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_commission_allocation_from_order() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER orders_sync_commission_allocation AFTER UPDATE OF payment_status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_commission_allocation_from_order();

CREATE OR REPLACE FUNCTION public.refresh_seller_vip_review(_seller_id uuid, _week_start timestamptz)
RETURNS public.seller_weekly_vip_reviews
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_week timestamptz := public.fee_week_start(_week_start);
  v_end timestamptz := ((v_week AT TIME ZONE 'America/New_York') + interval '7 days') AT TIME ZONE 'America/New_York';
  v_deadline timestamptz := ((v_week AT TIME ZONE 'America/New_York') + interval '21 days') AT TIME ZONE 'America/New_York';
  r record; v_row public.seller_weekly_vip_reviews; v_charged bigint; v_status text;
BEGIN
  WITH o AS (
    SELECT o.id, public.order_merch_cents(o.amount, o.shipping_amount) AS c,
      (o.delivered_at IS NOT NULL AND o.delivered_at <= v_deadline) AS delivered,
      EXISTS (SELECT 1 FROM public.disputes d WHERE d.order_id = o.id
              AND d.lifecycle_status IN ('opened','evidence_pending','under_review','escalated')) AS open_dispute,
      (o.refunded_at IS NOT NULL OR coalesce(o.status,'') IN ('refunded','cancelled','canceled')
        OR EXISTS (SELECT 1 FROM public.disputes d WHERE d.order_id = o.id
              AND d.lifecycle_status IN ('resolved_refund','resolved_partial','resolved_rebook'))) AS lost
    FROM public.orders o LEFT JOIN public.listings l ON l.id = o.listing_id
    WHERE o.seller_id = _seller_id AND o.payment_status IN ('paid','refunded')
      AND o.paid_at >= v_week AND o.paid_at < v_end
      AND (l.channel IS NULL OR l.channel = 'marketplace')
  )
  SELECT coalesce(sum(c),0)::bigint total,
         coalesce(sum(c) FILTER (WHERE delivered AND NOT lost),0)::bigint verified,
         coalesce(sum(c) FILTER (WHERE NOT delivered AND NOT lost),0)::bigint pending,
         coalesce(sum(c) FILTER (WHERE delivered AND NOT lost AND open_dispute),0)::bigint disputed,
         count(*)::int n, count(*) FILTER (WHERE delivered AND NOT lost)::int nd,
         count(*) FILTER (WHERE open_dispute)::int nod
  INTO r FROM o;

  SELECT coalesce(sum(a.commission_cents),0) INTO v_charged FROM public.seller_commission_allocations a
  WHERE a.seller_id = _seller_id AND a.week_start = v_week AND a.status = 'confirmed';

  v_status := CASE WHEN now() < v_end THEN 'in_progress'
                   WHEN (r.verified - r.disputed) >= 650000 THEN 'pending_review'
                   WHEN now() < v_deadline THEN 'in_progress'
                   ELSE 'not_qualified' END;

  INSERT INTO public.seller_weekly_vip_reviews AS v (seller_id, week_start, week_end, review_deadline,
    total_paid_sales_cents, verified_delivered_cents, pending_delivery_cents, disputed_excluded_cents, eligible_vip_sales_cents,
    total_orders_count, delivered_orders_count, active_disputes_count, delivery_performance_pct,
    standard_commission_cents, potential_vip_rebate_cents, status, last_calculated_at)
  VALUES (_seller_id, v_week, v_end, v_deadline, r.total, r.verified, r.pending, r.disputed, r.verified - r.disputed,
    r.n, r.nd, r.nod, CASE WHEN r.n > 0 THEN round(100.0 * r.nd / r.n, 2) ELSE 0 END,
    v_charged, GREATEST(0, v_charged - round(r.total * 0.05)::bigint), v_status, now())
  ON CONFLICT (seller_id, week_start) DO UPDATE SET
    total_paid_sales_cents = EXCLUDED.total_paid_sales_cents, verified_delivered_cents = EXCLUDED.verified_delivered_cents,
    pending_delivery_cents = EXCLUDED.pending_delivery_cents, disputed_excluded_cents = EXCLUDED.disputed_excluded_cents,
    eligible_vip_sales_cents = EXCLUDED.eligible_vip_sales_cents, total_orders_count = EXCLUDED.total_orders_count,
    delivered_orders_count = EXCLUDED.delivered_orders_count, active_disputes_count = EXCLUDED.active_disputes_count,
    delivery_performance_pct = EXCLUDED.delivery_performance_pct, standard_commission_cents = EXCLUDED.standard_commission_cents,
    potential_vip_rebate_cents = EXCLUDED.potential_vip_rebate_cents,
    status = CASE WHEN v.status IN ('approved','rejected') THEN v.status ELSE EXCLUDED.status END,
    last_calculated_at = now(), updated_at = now()
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.refresh_seller_vip_review(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_seller_vip_review(uuid, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.decide_seller_vip_review(_review_id uuid, _admin_id uuid, _action text, _reason text)
RETURNS public.seller_weekly_vip_reviews
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.seller_weekly_vip_reviews;
BEGIN
  IF NOT (has_role(_admin_id,'admin') OR has_role(_admin_id,'owner')) THEN RAISE EXCEPTION 'Admin only'; END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 3 THEN RAISE EXCEPTION 'A documented reason is required'; END IF;
  SELECT * INTO v FROM public.seller_weekly_vip_reviews WHERE id = _review_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Review not found'; END IF;
  v := public.refresh_seller_vip_review(v.seller_id, v.week_start);

  IF _action = 'approve' THEN
    IF v.status <> 'pending_review' THEN RAISE EXCEPTION 'Only reviews pending review can be approved'; END IF;
    IF v.eligible_vip_sales_cents < 650000 THEN RAISE EXCEPTION 'Eligible verified sales are below $6,500'; END IF;
    IF v.potential_vip_rebate_cents > 0 THEN
      INSERT INTO public.seller_commission_adjustments (seller_id, review_id, adjustment_type, amount_cents, reason, admin_user_id)
      VALUES (v.seller_id, v.id, 'vip_credit', v.potential_vip_rebate_cents, _reason, _admin_id)
      ON CONFLICT DO NOTHING;
    END IF;
    UPDATE public.seller_weekly_vip_reviews SET status = 'approved', reviewed_by = _admin_id, reviewed_at = now(),
      rejection_reason = NULL, notes = _reason, updated_at = now() WHERE id = v.id RETURNING * INTO v;
  ELSIF _action = 'reject' THEN
    IF v.status NOT IN ('pending_review','in_progress','not_qualified') THEN RAISE EXCEPTION 'This review cannot be rejected'; END IF;
    UPDATE public.seller_weekly_vip_reviews SET status = 'rejected', reviewed_by = _admin_id, reviewed_at = now(),
      rejection_reason = _reason, updated_at = now() WHERE id = v.id RETURNING * INTO v;
  ELSIF _action = 'reopen' THEN
    IF v.status = 'approved' THEN RAISE EXCEPTION 'Approved reviews already received their credit'; END IF;
    UPDATE public.seller_weekly_vip_reviews SET status = 'in_progress', reviewed_by = NULL, reviewed_at = NULL, updated_at = now()
      WHERE id = v.id;
    v := public.refresh_seller_vip_review(v.seller_id, v.week_start);
  ELSE RAISE EXCEPTION 'Unknown action';
  END IF;

  INSERT INTO public.seller_vip_review_events (review_id, actor_id, action, reason, snapshot)
  VALUES (v.id, _admin_id, _action, _reason, to_jsonb(v));
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.decide_seller_vip_review(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_seller_vip_review(uuid, uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.record_seller_commission_adjustment(_admin_id uuid, _seller_id uuid, _type text, _amount_cents bigint, _reason text, _order_id uuid DEFAULT NULL, _review_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT (has_role(_admin_id,'admin') OR has_role(_admin_id,'owner')) THEN RAISE EXCEPTION 'Admin only'; END IF;
  IF _type NOT IN ('manual_credit','manual_debit','dispute_reconsideration') THEN RAISE EXCEPTION 'Unsupported adjustment type'; END IF;
  IF _amount_cents = 0 THEN RAISE EXCEPTION 'Amount must not be zero'; END IF;
  INSERT INTO public.seller_commission_adjustments (seller_id, review_id, order_id, adjustment_type, amount_cents, reason, admin_user_id)
  VALUES (_seller_id, _review_id, _order_id, _type,
          CASE WHEN _type = 'manual_debit' THEN -abs(_amount_cents) ELSE abs(_amount_cents) END, _reason, _admin_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.record_seller_commission_adjustment(uuid, uuid, text, bigint, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_seller_commission_adjustment(uuid, uuid, text, bigint, text, uuid, uuid) TO service_role;