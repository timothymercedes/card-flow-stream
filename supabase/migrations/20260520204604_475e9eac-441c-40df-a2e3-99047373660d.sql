CREATE OR REPLACE FUNCTION public.place_live_bid(_stream_id uuid, _amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _username text;
  _s public.live_streams%ROWTYPE;
  _unpaid int;
  _min_inc numeric;
  _cur numeric;
  _remaining_ms bigint;
  _extended boolean := false;
  _sd_win boolean := false;
  _new_ends timestamptz;
  _exts int;
  _sd_sec int;
  _sd_max int;
  _dup_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Invalid bid amount'; END IF;
  IF public.is_bid_restricted(_uid) THEN RAISE EXCEPTION 'Account is currently restricted from bidding. Contact support.'; END IF;

  SELECT id INTO _dup_id
  FROM public.live_bids
  WHERE stream_id = _stream_id
    AND bidder_id = _uid
    AND amount = _amount
    AND created_at > now() - interval '2 seconds'
  ORDER BY created_at DESC
  LIMIT 1;
  IF _dup_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'amount', _amount, 'duplicate', true);
  END IF;

  SELECT COUNT(*) INTO _unpaid FROM public.orders WHERE buyer_id = _uid AND payment_status = 'awaiting_payment';
  IF _unpaid > 0 THEN RAISE EXCEPTION 'Pay your pending order before bidding'; END IF;

  SELECT * INTO _s FROM public.live_streams WHERE id = _stream_id FOR UPDATE;
  IF _s.id IS NULL THEN RAISE EXCEPTION 'Stream not found'; END IF;
  IF _s.seller_id = _uid THEN RAISE EXCEPTION 'Sellers cannot bid on their own stream'; END IF;
  IF _s.status <> 'live' THEN RAISE EXCEPTION 'Stream is not live'; END IF;
  IF _s.ends_at IS NULL OR _s.ends_at <= now() THEN RAISE EXCEPTION 'Auction not running'; END IF;
  IF public.is_bid_blocked(_stream_id, _uid) THEN RAISE EXCEPTION 'You are blocked from bidding here'; END IF;

  _cur := COALESCE(_s.current_bid, 0);
  _min_inc := GREATEST(COALESCE(_s.min_bid_increment, 1), 0.01);
  IF _amount < _cur + _min_inc THEN RAISE EXCEPTION 'Bid must be at least $%', (_cur + _min_inc)::text; END IF;

  SELECT username INTO _username FROM public.profiles WHERE id = _uid;
  _remaining_ms := EXTRACT(EPOCH FROM (_s.ends_at - now())) * 1000;
  _exts := COALESCE(_s.snipe_extends, 0);
  _sd_sec := GREATEST(1, COALESCE(_s.sudden_death_seconds_added, 5));
  _sd_max := GREATEST(1, COALESCE(_s.sudden_death_max_triggers, 3));

  IF COALESCE(_s.sudden_death_active, false) THEN
    _new_ends := now() + interval '1200 milliseconds';
    _sd_win := true;
    UPDATE public.live_streams
      SET current_bid = _amount, current_bidder_id = _uid, ends_at = _new_ends, sudden_death_active = false
      WHERE id = _stream_id;
  ELSIF COALESCE(_s.sudden_death_enabled, false) AND _remaining_ms > 0 AND _remaining_ms <= 3000 THEN
    _new_ends := GREATEST(_s.ends_at, now()) + make_interval(secs => _sd_sec);
    _extended := true;
    UPDATE public.live_streams
      SET current_bid = _amount,
          current_bidder_id = _uid,
          ends_at = _new_ends,
          snipe_extends = _exts + 1,
          sudden_death_active = ((_exts + 1) >= _sd_max)
      WHERE id = _stream_id;
  ELSE
    UPDATE public.live_streams
      SET current_bid = _amount, current_bidder_id = _uid
      WHERE id = _stream_id;
  END IF;

  BEGIN
    INSERT INTO public.live_bids (stream_id, bidder_id, bidder_username, amount, round_number, was_anti_snipe, was_sudden_death)
    VALUES (_stream_id, _uid, _username, _amount, _s.round_number, _extended, _sd_win);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', true, 'amount', _amount, 'duplicate', true);
  END;

  INSERT INTO public.audit_logs (actor_id, actor_username, action, target_type, target_id, meta)
  VALUES (_uid, _username, 'live_bid_placed', 'live_stream', _stream_id,
          jsonb_build_object('amount', _amount, 'prev_bid', _cur, 'extended', _extended, 'sudden_death_win', _sd_win));

  RETURN jsonb_build_object('ok', true, 'amount', _amount, 'extended', _extended, 'sudden_death_win', _sd_win);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.place_live_bid(uuid, numeric) TO authenticated;