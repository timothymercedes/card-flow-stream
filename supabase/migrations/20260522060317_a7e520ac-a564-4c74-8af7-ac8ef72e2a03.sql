ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS final_charged_total_cents INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_tax_cents INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_reconciliation_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS tax_reconciliation_details JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_orders_final_charged_total ON public.orders(final_charged_total_cents) WHERE final_charged_total_cents > 0;
CREATE INDEX IF NOT EXISTS idx_orders_tax_reconciliation_status ON public.orders(tax_reconciliation_status);

DO $$
BEGIN
  ALTER TYPE public.platform_revenue_kind ADD VALUE IF NOT EXISTS 'sales_tax_collected';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE public.platform_revenue_kind ADD VALUE IF NOT EXISTS 'sales_tax_refund';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.assert_order_payout_consistent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _subtotal numeric;
  _commission numeric;
  _payout numeric;
  _drift numeric;
  _tax numeric;
  _charged numeric;
BEGIN
  IF NEW.payment_status <> 'paid' THEN
    RETURN NEW;
  END IF;
  IF NEW.commission_amount IS NULL OR NEW.seller_payout_amount IS NULL THEN
    RETURN NEW;
  END IF;

  _subtotal := COALESCE(NEW.amount, 0) - COALESCE(NEW.shipping_amount, 0);
  _commission := COALESCE(NEW.commission_amount, 0);
  _payout := COALESCE(NEW.seller_payout_amount, 0);
  _tax := COALESCE(NEW.tax_cents, 0)::numeric / 100;
  _charged := COALESCE(NEW.final_charged_total_cents, 0)::numeric / 100;
  _drift := ABS((_commission + _payout) - _subtotal);

  IF _drift > 0.02 THEN
    RAISE EXCEPTION 'order % payout inconsistent: subtotal=% commission=% payout=% drift=%',
      NEW.id, _subtotal, _commission, _payout, _drift;
  END IF;

  IF _payout > _subtotal + 0.02 THEN
    RAISE EXCEPTION 'order % seller payout (%) exceeds subtotal (%)', NEW.id, _payout, _subtotal;
  END IF;

  IF _tax > 0 AND COALESCE(NEW.tax_jurisdiction, '') = '' THEN
    RAISE EXCEPTION 'order % has tax without jurisdiction', NEW.id;
  END IF;

  IF _charged > 0 AND _charged + 0.02 < COALESCE(NEW.amount, 0) + _tax THEN
    RAISE EXCEPTION 'order % charged total (%) is below order amount plus tax (%)',
      NEW.id, _charged, COALESCE(NEW.amount, 0) + _tax;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_payout_consistent ON public.orders;
CREATE TRIGGER trg_orders_payout_consistent
  BEFORE INSERT OR UPDATE OF payment_status, amount, shipping_amount, commission_amount, seller_payout_amount, tax_cents, tax_jurisdiction, final_charged_total_cents
  ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.assert_order_payout_consistent();

CREATE OR REPLACE FUNCTION public.assert_platform_revenue_traceable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.kind IN ('shipping_margin','marketplace_commission','intl_processing_fee','stripe_processing_fee','sales_tax_collected','sales_tax_refund')
     AND NEW.order_id IS NULL THEN
    RAISE EXCEPTION 'platform_revenue.% requires order_id', NEW.kind;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_platform_revenue_traceable ON public.platform_revenue;
CREATE TRIGGER trg_platform_revenue_traceable
  BEFORE INSERT ON public.platform_revenue
  FOR EACH ROW EXECUTE FUNCTION public.assert_platform_revenue_traceable();

CREATE OR REPLACE FUNCTION public.run_financial_reconciliation(
  _since timestamptz DEFAULT now() - interval '7 days'
)
RETURNS TABLE(
  scanned_orders bigint,
  missing_commission bigint,
  missing_shipping_margin bigint,
  payout_drift bigint,
  new_alerts bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _scanned bigint := 0;
  _missing_comm bigint := 0;
  _missing_ship bigint := 0;
  _drift bigint := 0;
  _alerts bigint := 0;
  _row record;
BEGIN
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
$$;

CREATE OR REPLACE FUNCTION public.admin_run_financial_reconciliation(_since timestamptz DEFAULT NULL)
RETURNS TABLE(
  scanned_orders bigint,
  missing_commission bigint,
  missing_shipping_margin bigint,
  payout_drift bigint,
  new_alerts bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM _assert_owner();
  RETURN QUERY SELECT * FROM public.run_financial_reconciliation(
    COALESCE(_since, now() - interval '7 days')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_auction_round(_stream_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
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
  SELECT * INTO _s FROM public.live_streams WHERE id = _stream_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stream not found';
  END IF;

  IF NOT (_caller = _s.seller_id OR _caller = _s.current_bidder_id OR public.has_role(_caller, 'admin') OR public.has_role(_caller, 'owner')) THEN
    RAISE EXCEPTION 'Only the seller, winning bidder, or admin can finalize';
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
$$;

GRANT EXECUTE ON FUNCTION public.finalize_auction_round(uuid) TO authenticated;