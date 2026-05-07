CREATE OR REPLACE FUNCTION public.place_listing_bid(_listing_id uuid, _amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _username text;
  _l listings%ROWTYPE;
  _unpaid int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Invalid bid amount'; END IF;

  SELECT COUNT(*) INTO _unpaid FROM public.orders
    WHERE buyer_id = _uid AND payment_status = 'awaiting_payment';
  IF _unpaid > 0 THEN RAISE EXCEPTION 'Pay your pending order before bidding'; END IF;

  SELECT * INTO _l FROM public.listings WHERE id = _listing_id FOR UPDATE;
  IF _l.id IS NULL THEN RAISE EXCEPTION 'Listing not found'; END IF;
  IF _l.seller_id = _uid THEN RAISE EXCEPTION 'Sellers cannot bid on their own listing'; END IF;
  IF COALESCE(_l.listing_type, 'buy_now') <> 'auction' AND NOT _l.is_auction THEN
    RAISE EXCEPTION 'Listing is not an auction';
  END IF;
  IF _l.auction_status <> 'active' THEN RAISE EXCEPTION 'Auction is not active'; END IF;
  IF _l.auction_ends_at IS NOT NULL AND _l.auction_ends_at <= now() THEN
    RAISE EXCEPTION 'Auction ended';
  END IF;
  IF _amount <= COALESCE(_l.current_bid, _l.starting_bid, 0) THEN
    RAISE EXCEPTION 'Bid must be higher than current bid';
  END IF;

  SELECT username INTO _username FROM public.profiles WHERE id = _uid;

  INSERT INTO public.listing_bids (listing_id, user_id, username, amount)
  VALUES (_listing_id, _uid, _username, _amount);

  UPDATE public.listings
    SET current_bid = _amount, top_bidder_id = _uid
    WHERE id = _listing_id;

  -- Anti-snipe: extend by 60s if last 30s
  IF _l.auction_ends_at IS NOT NULL AND _l.auction_ends_at - now() < interval '30 seconds' THEN
    UPDATE public.listings SET auction_ends_at = now() + interval '60 seconds' WHERE id = _listing_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'amount', _amount);
END;
$$;

REVOKE ALL ON FUNCTION public.place_listing_bid(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_listing_bid(uuid, numeric) TO authenticated;