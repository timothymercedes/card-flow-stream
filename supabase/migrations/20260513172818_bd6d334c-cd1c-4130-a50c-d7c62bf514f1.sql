
-- ============================================================
-- Realtime reconciliation + watchdog system
-- Detects and recovers from desync between auctions, orders,
-- payments, shipping, and Seller Hub inventory.
-- ============================================================

-- 1) Reconcile listing.sold_count vs actual paid orders
CREATE OR REPLACE FUNCTION public.reconcile_sold_items()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _fixed integer := 0;
BEGIN
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
$$;

-- 2) Reconcile stuck auction states: ended_at long past, no winner finalized
CREATE OR REPLACE FUNCTION public.reconcile_auction_states()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _r record;
  _fixed integer := 0;
BEGIN
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
$$;

-- 3) Reconcile payment/order desync: orders awaiting_payment > 24h
CREATE OR REPLACE FUNCTION public.reconcile_stale_payments()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _flagged integer := 0;
BEGIN
  WITH stale AS (
    UPDATE public.orders
       SET payment_status = 'failed'
     WHERE payment_status = 'awaiting_payment'
       AND created_at < now() - interval '24 hours'
       AND paid_at IS NULL
    RETURNING id, buyer_id, title
  ), notif AS (
    INSERT INTO public.notifications (user_id, sender_id, type, body, link)
    SELECT s.buyer_id, s.buyer_id, 'payment_failed',
           '⚠️ Your order "' || s.title || '" expired due to non-payment. Tap to retry.',
           '/orders'
      FROM stale s
    RETURNING 1
  )
  SELECT count(*) INTO _flagged FROM stale;
  RETURN COALESCE(_flagged, 0);
END;
$$;

-- 4) Master reconciliation runner — single entrypoint for cron
CREATE OR REPLACE FUNCTION public.run_platform_reconciliation()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _sold int := 0;
  _auctions int := 0;
  _payments int := 0;
  _safety int := 0;
BEGIN
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
$$;

-- 5) Cron: run reconciliation every 5 minutes (SQL-only, no HTTP)
DO $$
BEGIN
  PERFORM cron.unschedule('platform-reconciliation-5min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'platform-reconciliation-5min',
  '*/5 * * * *',
  $$ SELECT public.run_platform_reconciliation(); $$
);
