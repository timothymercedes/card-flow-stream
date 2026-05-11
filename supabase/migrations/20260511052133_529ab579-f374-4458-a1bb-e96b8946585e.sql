
-- 1. Allow trusted SECURITY DEFINER code to send DMs as the seller.
CREATE OR REPLACE FUNCTION public.direct_messages_validate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _recent int;
  _cu text := current_user;
BEGIN
  -- Bypass for elevated server context (SECURITY DEFINER admin clients / cron).
  IF _cu IN ('postgres','supabase_admin','service_role','authenticator')
     AND current_setting('app.bypass_dm_check', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NEW.sender_id <> _uid THEN RAISE EXCEPTION 'Sender mismatch'; END IF;
  IF NEW.recipient_id = _uid THEN RAISE EXCEPTION 'Cannot message yourself'; END IF;
  IF NEW.content IS NULL OR length(btrim(NEW.content)) = 0 OR length(NEW.content) > 2000 THEN
    RAISE EXCEPTION 'Message must be 1..2000 chars';
  END IF;

  SELECT count(*) INTO _recent FROM public.direct_messages
    WHERE sender_id = _uid AND created_at > now() - interval '1 minute';
  IF _recent >= 60 THEN
    RAISE EXCEPTION 'Slow down — DM rate limit reached';
  END IF;

  RETURN NEW;
END;
$function$;

-- 2. Server-authoritative rearm of the next round.
CREATE OR REPLACE FUNCTION public.rearm_next_round(_stream_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _s public.live_streams%ROWTYPE;
  _caller uuid := auth.uid();
  _is_admin boolean;
  _remaining int;
  _sec int;
  _start numeric;
BEGIN
  SELECT * INTO _s FROM public.live_streams WHERE id = _stream_id FOR UPDATE;
  IF _s.id IS NULL THEN RAISE EXCEPTION 'Stream not found'; END IF;

  _is_admin := _caller IS NOT NULL AND (public.has_role(_caller,'admin') OR public.has_role(_caller,'owner'));
  -- Allow seller, admin, or system-invoked (auth.uid() IS NULL via cron) to rearm.
  IF _caller IS NOT NULL AND NOT _is_admin AND _caller <> _s.seller_id THEN
    RAISE EXCEPTION 'Only the seller or admin can rearm';
  END IF;

  _remaining := GREATEST(0, COALESCE(_s.quick_start_remaining, 0));
  _sec := GREATEST(5, COALESCE(_s.default_timer_sec, 30));
  _start := GREATEST(0.01, COALESCE(_s.default_starting_bid, _s.starting_bid, 1));

  IF _remaining > 0 THEN
    UPDATE public.live_streams SET
      ends_at = now() + make_interval(secs => _sec),
      starting_bid = _start,
      current_bid = _start,
      current_bidder_id = NULL,
      winner_id = NULL,
      winning_bid = NULL,
      winner_username = NULL,
      pinned_card = NULL,
      snipe_extends = 0,
      sudden_death_active = false,
      quick_start_remaining = _remaining - 1,
      last_activity_at = now(),
      last_activity_type = 'round_rearmed'
    WHERE id = _stream_id;
  ELSE
    UPDATE public.live_streams SET
      ends_at = NULL,
      current_bidder_id = NULL,
      winner_id = NULL,
      winning_bid = NULL,
      winner_username = NULL,
      pinned_card = NULL
    WHERE id = _stream_id;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, meta)
  VALUES (_caller, 'auction_rearmed', 'live_stream', _stream_id,
          jsonb_build_object('remaining', _remaining, 'timer_sec', _sec, 'starting_bid', _start));

  RETURN jsonb_build_object('ok', true, 'remaining', GREATEST(0, _remaining - 1));
END;
$function$;
GRANT EXECUTE ON FUNCTION public.rearm_next_round(uuid) TO authenticated;

-- 3. Enhance finalize_auction_round to send the winner DM via the bypass.
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
  _seller_username text;
  _p RECORD;
  _order_id uuid;
  _existing_order uuid;
  _is_admin boolean;
  _pin jsonb;
BEGIN
  SELECT * INTO _s FROM public.live_streams WHERE id = _stream_id FOR UPDATE;
  IF _s.id IS NULL THEN RAISE EXCEPTION 'Stream not found'; END IF;

  _is_admin := _caller IS NOT NULL AND (public.has_role(_caller, 'admin') OR public.has_role(_caller, 'owner'));
  -- Allow system / cron (caller IS NULL) too, in addition to seller/winner/admin.
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

  SELECT shipping_cap INTO _cap FROM public.profiles WHERE id = _s.seller_id;
  _ship := COALESCE(_s.shipping_price, 0);
  _ship_for_this := CASE WHEN _cap IS NULL THEN _ship ELSE GREATEST(0, LEAST(_ship, _cap)) END;

  SELECT p.full_name, p.address_line1, p.address_city, p.address_state, p.address_zip, p.address_country
    INTO _p FROM public.profiles p WHERE p.id = _winner_id;

  INSERT INTO public.receipts (stream_id, buyer_id, seller_id, item_name, item_image_url, amount)
    VALUES (_stream_id, _winner_id, _s.seller_id, _label, _s.item_image_url, _winning_bid);

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

  -- Seller notification (self-target avoids rate limits)
  INSERT INTO public.notifications (user_id, sender_id, type, body, link)
    VALUES (_s.seller_id, _s.seller_id, 'sale',
      '💰 Sold "' || _item_name || '" to @' || COALESCE(_winner_username,'buyer') ||
      ' for $' || _winning_bid, '/store');

  -- Winner DM (bypasses sender check)
  PERFORM set_config('app.bypass_dm_check', 'on', true);
  BEGIN
    INSERT INTO public.direct_messages (sender_id, sender_username, recipient_id, content)
    VALUES (_s.seller_id, COALESCE(_seller_username, 'seller'), _winner_id,
      '🏆 You won "' || _item_name || '" for $' || _winning_bid ||
      '! Total with shipping: $' || to_char(_winning_bid + _ship_for_this, 'FM999990.00') ||
      '. Pay at /orders');
  EXCEPTION WHEN OTHERS THEN
    -- Don't let DM failure block finalization
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
    'shipping', _ship_for_this);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.finalize_auction_round(uuid) TO authenticated;

-- 4. Cron-callable sweep: finalize expired + auto-rearm idle streams.
CREATE OR REPLACE FUNCTION public.sweep_stuck_auctions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row RECORD;
  _finalized int := 0;
  _rearmed int := 0;
  _errors int := 0;
BEGIN
  -- (a) Finalize any expired auction that still has bidders attached
  FOR _row IN
    SELECT id FROM public.live_streams
     WHERE status = 'live'
       AND ends_at IS NOT NULL
       AND ends_at < now() - interval '15 seconds'
       AND winner_id IS NULL
     LIMIT 50
  LOOP
    BEGIN
      PERFORM public.finalize_auction_round(_row.id);
      _finalized := _finalized + 1;
    EXCEPTION WHEN OTHERS THEN
      _errors := _errors + 1;
      INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, meta)
      VALUES (NULL, 'auction_sweep_error', 'live_stream', _row.id,
              jsonb_build_object('error', SQLERRM));
    END;
  END LOOP;

  -- (b) Auto-rearm: a finalized round whose banner has been up for >10s
  --     and remaining quick-start quantity exists.
  FOR _row IN
    SELECT id FROM public.live_streams
     WHERE status = 'live'
       AND winner_id IS NOT NULL
       AND ends_at IS NOT NULL
       AND ends_at < now() - interval '10 seconds'
       AND COALESCE(quick_start_remaining, 0) > 0
     LIMIT 50
  LOOP
    BEGIN
      PERFORM public.rearm_next_round(_row.id);
      _rearmed := _rearmed + 1;
    EXCEPTION WHEN OTHERS THEN
      _errors := _errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('finalized', _finalized, 'rearmed', _rearmed, 'errors', _errors);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.sweep_stuck_auctions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sweep_stuck_auctions() TO postgres, service_role;

-- 5. Admin replay tools
CREATE OR REPLACE FUNCTION public.admin_replay_finalize(_stream_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _caller uuid := auth.uid();
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_role(_caller,'admin') OR public.has_role(_caller,'owner')) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  -- Force ends_at into the past so finalize is permitted
  UPDATE public.live_streams SET ends_at = LEAST(ends_at, now() - interval '1 second')
   WHERE id = _stream_id AND ends_at IS NOT NULL;
  RETURN public.finalize_auction_round(_stream_id);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.admin_replay_finalize(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_force_rearm(_stream_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _caller uuid := auth.uid();
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_role(_caller,'admin') OR public.has_role(_caller,'owner')) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  RETURN public.rearm_next_round(_stream_id);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.admin_force_rearm(uuid) TO authenticated;

-- 6. Schedule the sweep every minute
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sweep-stuck-auctions') THEN
    PERFORM cron.unschedule('sweep-stuck-auctions');
  END IF;
END $$;

SELECT cron.schedule(
  'sweep-stuck-auctions',
  '* * * * *',
  $$ SELECT public.sweep_stuck_auctions(); $$
);
