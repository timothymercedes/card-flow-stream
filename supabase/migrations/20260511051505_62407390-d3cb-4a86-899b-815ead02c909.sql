
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
  _cap numeric;
  _ship_for_this numeric;
  _winner_username text;
  _p RECORD;
  _order_id uuid;
  _existing_order uuid;
  _is_admin boolean;
  _pin jsonb;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO _s FROM public.live_streams WHERE id = _stream_id FOR UPDATE;
  IF _s.id IS NULL THEN RAISE EXCEPTION 'Stream not found'; END IF;

  _is_admin := public.has_role(_caller, 'admin') OR public.has_role(_caller, 'owner');
  IF NOT _is_admin
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

  -- Idempotency: if already finalized for this winner+bid, return existing order
  IF _winner_id IS NOT NULL AND _s.winner_id = _winner_id
     AND COALESCE(_s.winning_bid, 0) = _winning_bid THEN
    SELECT id INTO _existing_order FROM public.orders
      WHERE stream_id = _stream_id AND buyer_id = _winner_id
        AND amount >= _winning_bid
      ORDER BY created_at DESC LIMIT 1;
    RETURN jsonb_build_object('ok', true, 'already_finalized', true, 'order_id', _existing_order);
  END IF;

  IF _winner_id IS NULL THEN
    -- No bids: silently clear the round, log audit
    UPDATE public.live_streams SET ends_at = NULL WHERE id = _stream_id;
    INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, meta)
      VALUES (_caller, 'auction_no_winner', 'live_stream', _stream_id,
              jsonb_build_object('round', _next_round));
    RETURN jsonb_build_object('ok', true, 'no_winner', true);
  END IF;

  SELECT username INTO _winner_username FROM public.profiles WHERE id = _winner_id;

  -- Shipping (apply seller cap)
  SELECT shipping_cap INTO _cap FROM public.profiles WHERE id = _s.seller_id;
  _ship := COALESCE(_s.shipping_price, 0);
  _ship_for_this := CASE WHEN _cap IS NULL THEN _ship ELSE GREATEST(0, LEAST(_ship, _cap)) END;

  SELECT p.full_name, p.address_line1, p.address_city, p.address_state, p.address_zip, p.address_country
    INTO _p FROM public.profiles p WHERE p.id = _winner_id;

  -- Receipt
  INSERT INTO public.receipts (stream_id, buyer_id, seller_id, item_name, item_image_url, amount)
    VALUES (_stream_id, _winner_id, _s.seller_id, _label, _s.item_image_url, _winning_bid);

  -- Order — relies on uq_orders_stream_winner_bid to prevent duplicates
  BEGIN
    INSERT INTO public.orders (
      buyer_id, seller_id, title, description, amount, item_image_url,
      stream_id, condition, status, payment_status,
      ship_name, ship_address, ship_city, ship_state, ship_zip, ship_country
    ) VALUES (
      _winner_id, _s.seller_id, _label, _s.item_description,
      _winning_bid + _ship_for_this, _s.item_image_url, _stream_id,
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

  -- Lock winner on the stream
  UPDATE public.live_streams SET
    winner_id = _winner_id,
    winning_bid = _winning_bid,
    winner_username = _winner_username,
    round_number = _next_round
  WHERE id = _stream_id;

  -- Notification to winner (self-target — no rate limit)
  INSERT INTO public.notifications (user_id, sender_id, type, body, link)
    VALUES (_winner_id, _winner_id, 'won',
      '🎉 You won Bid #' || _next_round || ' "' || _item_name ||
      '" for $' || _winning_bid || '. Tap to pay now.', '/orders');

  -- Payment event log (uses SECURITY DEFINER privileges)
  INSERT INTO public.stream_payment_events
    (stream_id, seller_id, buyer_id, buyer_username, order_id, event_type, amount, item_label, message)
    VALUES (_stream_id, _s.seller_id, _winner_id, _winner_username, _order_id,
            'payment_pending', _winning_bid + _ship_for_this, _label,
            'Awaiting payment from buyer');

  -- Audit log
  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, meta)
    VALUES (_caller, 'auction_finalized', 'live_stream', _stream_id,
            jsonb_build_object(
              'round', _next_round, 'winner_id', _winner_id,
              'winner_username', _winner_username, 'winning_bid', _winning_bid,
              'order_id', _order_id, 'shipping', _ship_for_this));

  -- Mark matching marketplace listing as sold-out
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
    'shipping', _ship_for_this);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.finalize_auction_round(uuid) TO authenticated;
