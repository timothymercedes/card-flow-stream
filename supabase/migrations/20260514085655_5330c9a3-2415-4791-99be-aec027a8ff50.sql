
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS label_url text,
  ADD COLUMN IF NOT EXISTS is_giveaway boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.create_giveaway_order(_giveaway_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _g giveaways%ROWTYPE;
  _stream_title text;
  _full_name text; _addr text; _city text; _state text; _zip text; _country text;
  _order_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO _g FROM giveaways WHERE id = _giveaway_id;
  IF _g IS NULL THEN RAISE EXCEPTION 'Giveaway not found'; END IF;
  IF _g.winner_id IS NULL THEN RAISE EXCEPTION 'No winner yet'; END IF;
  IF _g.seller_id <> auth.uid() AND _g.winner_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the host or winner can finalize this giveaway';
  END IF;

  SELECT id INTO _order_id FROM orders
  WHERE seller_id = _g.seller_id AND buyer_id = _g.winner_id
    AND stream_id = _g.stream_id
    AND title = 'Giveaway — ' || COALESCE(_g.prize_label, 'Prize')
  LIMIT 1;
  IF _order_id IS NOT NULL THEN
    UPDATE orders SET is_giveaway = true WHERE id = _order_id AND is_giveaway = false;
    RETURN _order_id;
  END IF;

  SELECT title INTO _stream_title FROM live_streams WHERE id = _g.stream_id;

  SELECT COALESCE(p.full_name, p.username, 'Winner'),
         COALESCE(p.address_line1, ''), COALESCE(p.address_city, ''),
         COALESCE(p.address_state, ''), COALESCE(p.address_zip, ''),
         COALESCE(p.address_country, 'US')
    INTO _full_name, _addr, _city, _state, _zip, _country
  FROM profiles p WHERE p.id = _g.winner_id;

  INSERT INTO orders (
    buyer_id, seller_id, title, description, amount,
    stream_id, status, payment_status, paid_at, is_giveaway,
    ship_name, ship_address, ship_city, ship_state, ship_zip, ship_country
  ) VALUES (
    _g.winner_id, _g.seller_id,
    'Giveaway — ' || COALESCE(_g.prize_label, 'Prize'),
    'Giveaway prize from ' || COALESCE(_stream_title, 'live stream') || ' (shipping covered by host)',
    0,
    _g.stream_id, 'pending', 'paid', now(), true,
    _full_name, _addr, _city, _state, _zip, _country
  ) RETURNING id INTO _order_id;

  RETURN _order_id;
END;
$$;
