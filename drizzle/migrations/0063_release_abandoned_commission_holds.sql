CREATE OR REPLACE FUNCTION public.release_commission_allocation(_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.seller_commission_allocations%ROWTYPE;
BEGIN
  SELECT * INTO a FROM public.seller_commission_allocations WHERE order_id = _order_id FOR UPDATE;
  IF NOT FOUND OR a.status <> 'reserved' THEN RETURN; END IF;
  UPDATE public.seller_weekly_sales_tracker SET cumulative_sales_cents = GREATEST(0, cumulative_sales_cents - a.sale_cents), updated_at = now()
    WHERE seller_id = a.seller_id AND week_start = a.week_start;
  UPDATE public.seller_commission_allocations SET status = 'released', updated_at = now() WHERE order_id = _order_id;
END $$;
REVOKE ALL ON FUNCTION public.release_commission_allocation(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_commission_allocation(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.release_stale_commission_allocations(_seller_id uuid, _week_start timestamptz)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN SELECT a.order_id FROM public.seller_commission_allocations a
    LEFT JOIN public.orders o ON o.id = a.order_id
    WHERE a.seller_id = _seller_id AND a.week_start = _week_start AND a.status = 'reserved'
      AND (o.id IS NULL OR (coalesce(o.payment_status,'') <> 'paid' AND a.updated_at < now() - interval '30 minutes'))
  LOOP PERFORM public.release_commission_allocation(r.order_id); n := n + 1; END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.release_stale_commission_allocations(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_stale_commission_allocations(uuid, timestamptz) TO service_role;

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

  PERFORM 1 FROM public.seller_weekly_sales_tracker t WHERE t.seller_id = _seller_id AND t.week_start = v_week FOR UPDATE;
  PERFORM public.release_stale_commission_allocations(_seller_id, v_week);
  SELECT t.cumulative_sales_cents INTO v_prior FROM public.seller_weekly_sales_tracker t
  WHERE t.seller_id = _seller_id AND t.week_start = v_week;

  SELECT * INTO v_existing FROM public.seller_commission_allocations WHERE order_id = _order_id FOR UPDATE;
  IF FOUND AND v_existing.status <> 'released' THEN
    IF v_existing.status = 'reserved' THEN
      UPDATE public.seller_commission_allocations SET updated_at = now() WHERE order_id = _order_id;
    END IF;
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
  SELECT * INTO a FROM public.seller_commission_allocations WHERE order_id = NEW.id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  PERFORM 1 FROM public.seller_weekly_sales_tracker WHERE seller_id = a.seller_id AND week_start = a.week_start FOR UPDATE;
  SELECT * INTO a FROM public.seller_commission_allocations WHERE order_id = NEW.id FOR UPDATE;
  IF NEW.payment_status = 'paid' AND a.status = 'reserved' THEN
    UPDATE public.seller_commission_allocations SET status = 'confirmed', updated_at = now() WHERE order_id = NEW.id;
  ELSIF NEW.payment_status = 'paid' AND a.status = 'released' THEN
    UPDATE public.seller_weekly_sales_tracker SET cumulative_sales_cents = cumulative_sales_cents + a.sale_cents, updated_at = now()
      WHERE seller_id = a.seller_id AND week_start = a.week_start;
    UPDATE public.seller_commission_allocations SET status = 'confirmed', updated_at = now() WHERE order_id = NEW.id;
  ELSIF NEW.payment_status IN ('cancelled','canceled','expired','failed') AND OLD.payment_status <> 'paid' THEN
    PERFORM public.release_commission_allocation(NEW.id);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_commission_allocation_from_order() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.release_commission_on_order_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.seller_commission_allocations%ROWTYPE;
BEGIN
  IF coalesce(OLD.payment_status,'') = 'paid' THEN RETURN OLD; END IF;
  SELECT * INTO a FROM public.seller_commission_allocations WHERE order_id = OLD.id;
  IF NOT FOUND OR a.status <> 'reserved' THEN RETURN OLD; END IF;
  PERFORM 1 FROM public.seller_weekly_sales_tracker WHERE seller_id = a.seller_id AND week_start = a.week_start FOR UPDATE;
  PERFORM public.release_commission_allocation(OLD.id);
  RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.release_commission_on_order_delete() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS orders_release_commission_on_delete ON public.orders;
CREATE TRIGGER orders_release_commission_on_delete AFTER DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.release_commission_on_order_delete();

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT DISTINCT seller_id, week_start FROM public.seller_commission_allocations WHERE status = 'reserved' LOOP
    PERFORM 1 FROM public.seller_weekly_sales_tracker WHERE seller_id = r.seller_id AND week_start = r.week_start FOR UPDATE;
    PERFORM public.release_stale_commission_allocations(r.seller_id, r.week_start);
  END LOOP;
END $$;