-- 1. Add a column to track the shipping portion of each order separately.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shipping_amount numeric NOT NULL DEFAULT 0;

-- 2. Recreate finalize_auction_round with combined per-session shipping cap.
CREATE OR REPLACE FUNCTION public.finalize_auction_round(_stream_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _s public.live_streams%ROWTYPE;
  _winner_id uuid;
  _winning_bid numeric;
  _next_round int;
  _item_name text;
  _label text;
  _ship numeric;
  _seller_cap numeric;
  _ship_for_this numeric;
  _winner_username text;
  _seller_username text;
  _p RECORD;
  _order_id uuid;
  _existing_order uuid;
  _is_admin boolean;
  _pin jsonb;
  _country text;
  _session_cap numeric;
  _prior_session_ship numeric;
  _remaining numeric;
BEGIN
  SELECT * INTO _s FROM public.live_streams WHERE id = _stream_id FOR UPDATE;
  IF _s.id IS NULL THEN RAISE EXCEPTION 'Stream not found'; END IF;

  _is_admin := _caller IS NOT NULL AND (public.has_role(_caller, 'admin') OR public.has_role(_caller, 'owner'));
  IF _caller IS NOT NULL
     AND NOT _is_admin
     AND _caller <> _s.seller_id
     AND _caller IS DISTINCT FROM _s.current_bidder_id THEN
    RAISE EXCEPTION 'Only the seller, winning bidder, or admin can finalize';
  END IF;

  IF _s.ends_at IS NULL OR _s.ends_at > now() THEN
    RAISE EXCEPTION 'Auction has not ended yet';
  END IF;

  _winner_id := _s.current_bidder_id;
  _winning_bid := COALESCE(_s.current_bid, 0);
  _next_round := COALESCE(_s.round_number, 0) + 1;
  _item_name := COALESCE(_s.current_item, _s.title, 'Item');
  _label := 'Bid #' || _next_round || ' — ' || _item_name;

  IF _winner_id IS NOT NULL AND _s.winner_id = _winner_id
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

  SELECT p.full_name, p.address_line1, p.address_city, p.address_state, p.address_zip, p.address_country
    INTO _p FROM public.profiles p WHERE p.id = _winner_id;

  -- Determine system per-session cap by buyer country
  _country := UPPER(COALESCE(_p.address_country, 'US'));
  _session_cap := CASE WHEN _country IN ('US', 'USA') THEN 7.00 ELSE 20.00 END;

  -- Seller's optional combined-cap on profile (stricter wins if set)
  SELECT shipping_cap INTO _seller_cap FROM public.profiles WHERE id = _s.seller_id;
  IF _seller_cap IS NOT NULL THEN
    _session_cap := LEAST(_session_cap, _seller_cap);
  END IF;

  -- Sum shipping already paid by this buyer for this seller in this stream
  SELECT COALESCE(SUM(COALESCE(shipping_amount, 0)), 0)
    INTO _prior_session_ship
    FROM public.orders
    WHERE stream_id = _stream_id
      AND buyer_id = _winner_id
      AND seller_id = _s.seller_id;

  _ship := COALESCE(_s.shipping_price, 0);
  _remaining := GREATEST(0, _session_cap - _prior_session_ship);
  _ship_for_this := LEAST(_ship, _remaining);

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
      '" for $' || _winning_bid ||
      CASE WHEN _ship_for_this = 0 AND _ship > 0
           THEN ' (shipping FREE — session cap reached!)'
           ELSE '' END ||
      '. Tap to pay now.', '/orders');

  INSERT INTO public.notifications (user_id, sender_id, type, body, link)
    VALUES (_s.seller_id, _s.seller_id, 'sale',
      '💰 Sold "' || _item_name || '" to @' || COALESCE(_winner_username,'buyer') ||
      ' for $' || _winning_bid, '/store');

  PERFORM set_config('app.bypass_dm_check', 'on', true);
  BEGIN
    INSERT INTO public.direct_messages (sender_id, sender_username, recipient_id, content)
    VALUES (_s.seller_id, COALESCE(_seller_username, 'seller'), _winner_id,
      '🏆 You won "' || _item_name || '" for $' || _winning_bid ||
      '! Total with shipping: $' || to_char(_winning_bid + _ship_for_this, 'FM999990.00') ||
      CASE WHEN _ship_for_this < _ship
           THEN ' (combined-shipping discount applied)'
           ELSE '' END ||
      '. Pay at /orders');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  PERFORM set_config('app.bypass_dm_check', 'off', true);

  INSERT INTO public.stream_payment_events
    (stream_id, seller_id, buyer_id, buyer_username, order_id, event_type, amount, item_label, message)
    VALUES (_stream_id, _s.seller_id, _winner_id, _winner_username, _order_id,
            'payment_pending', _winning_bid + _ship_for_this, _label,
            'Awaiting payment from buyer');

  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, meta)
    VALUES (_caller, 'auction_finalized', 'live_stream', _stream_id,
            jsonb_build_object(
              'round', _next_round, 'winner_id', _winner_id,
              'winner_username', _winner_username, 'winning_bid', _winning_bid,
              'order_id', _order_id, 'shipping', _ship_for_this,
              'session_cap', _session_cap, 'prior_session_ship', _prior_session_ship,
              'buyer_country', _country,
              'system', _caller IS NULL));

  _pin := _s.pinned_card;
  IF _pin IS NOT NULL AND (_pin->>'name') IS NOT NULL THEN
    UPDATE public.listings l SET sold_count = l.quantity
      WHERE l.id = (
        SELECT id FROM public.listings
         WHERE seller_id = _s.seller_id
           AND title ILIKE '%' || (_pin->>'name') || '%'
           AND (expires_at IS NULL OR expires_at > now())
           AND COALESCE(sold_count, 0) < COALESCE(quantity, 1)
         ORDER BY created_at DESC LIMIT 1);

    UPDATE public.vault_cards
      SET status = 'sold', sold_at = now(), sold_stream_id = _stream_id
     WHERE id = (
        SELECT id FROM public.vault_cards
         WHERE user_id = _s.seller_id AND status = 'available'
           AND name ILIKE '%' || (_pin->>'name') || '%'
         LIMIT 1);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', _order_id,
    'winner_id', _winner_id,
    'winner_username', _winner_username,
    'winning_bid', _winning_bid,
    'round_number', _next_round,
    'shipping', _ship_for_this,
    'session_cap', _session_cap,
    'shipping_capped', _ship_for_this < _ship);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.finalize_auction_round(uuid) TO authenticated;