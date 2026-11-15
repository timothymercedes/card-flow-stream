ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'marketplace';

ALTER TABLE public.listings ADD CONSTRAINT listings_channel_check
  CHECK (channel IN ('marketplace', 'pb_store', 'bazaar'));

ALTER TABLE public.listings ADD CONSTRAINT no_auctions_in_pb_store_or_bazaar
  CHECK (
    channel = 'marketplace' OR
    (is_auction IS FALSE AND coalesce(listing_type, 'buy_now') = 'buy_now' AND accepts_offers IS FALSE)
  );

CREATE OR REPLACE FUNCTION public.check_listing_channel_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _label text;
BEGIN
  IF NEW.channel IN ('pb_store', 'bazaar') THEN
    _label := CASE WHEN NEW.channel = 'pb_store' THEN 'PB Store' ELSE 'PB Bazaar' END;
    IF OLD.is_auction IS TRUE OR OLD.listing_type = 'auction' THEN
      RAISE EXCEPTION 'Cannot convert an auction listing into a % listing.', _label;
    END IF;
    IF OLD.accepts_offers IS TRUE OR OLD.listing_type = 'offer' THEN
      RAISE EXCEPTION 'Cannot convert an offer-accepting listing into a % listing.', _label;
    END IF;
    IF EXISTS (SELECT 1 FROM public.listing_bids WHERE listing_id = OLD.id) THEN
      RAISE EXCEPTION 'Cannot convert a listing with bid history into a % listing.', _label;
    END IF;
    IF EXISTS (SELECT 1 FROM public.offers WHERE listing_id = OLD.id) THEN
      RAISE EXCEPTION 'Cannot convert a listing with existing offers into a % listing.', _label;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_check_listing_channel_transition
  BEFORE UPDATE OF channel, is_auction, listing_type, accepts_offers ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.check_listing_channel_transition();

CREATE OR REPLACE FUNCTION public.check_listing_bid_allowed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _channel text;
BEGIN
  SELECT l.channel INTO _channel FROM public.listings l WHERE l.id = NEW.listing_id;
  IF _channel IN ('pb_store', 'bazaar') THEN
    RAISE EXCEPTION 'Bidding is not supported in %. Fixed-price purchases only.',
      CASE WHEN _channel = 'pb_store' THEN 'PB Store' ELSE 'PB Bazaar' END;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_check_listing_bid_allowed
  BEFORE INSERT OR UPDATE ON public.listing_bids
  FOR EACH ROW EXECUTE FUNCTION public.check_listing_bid_allowed();

CREATE OR REPLACE FUNCTION public.check_offer_allowed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _channel text;
BEGIN
  SELECT l.channel INTO _channel FROM public.listings l WHERE l.id = NEW.listing_id;
  IF _channel IN ('pb_store', 'bazaar') THEN
    RAISE EXCEPTION 'Offers are not supported in %. Fixed-price purchases only.',
      CASE WHEN _channel = 'pb_store' THEN 'PB Store' ELSE 'PB Bazaar' END;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_check_offer_allowed
  BEFORE INSERT OR UPDATE ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.check_offer_allowed();

CREATE OR REPLACE FUNCTION public.place_listing_bid(_listing_id uuid, _amount numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _uid uuid := auth.uid();
  _initial_channel text;
  _username text;
  _l public.listings%ROWTYPE;
  _unpaid int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Invalid bid amount'; END IF;

  SELECT channel INTO _initial_channel FROM public.listings WHERE id = _listing_id;
  IF _initial_channel IS NULL THEN RAISE EXCEPTION 'Listing not found'; END IF;
  IF _initial_channel IN ('pb_store', 'bazaar') THEN
    RAISE EXCEPTION 'Bidding is not supported in %. Fixed-price purchases only.',
      CASE WHEN _initial_channel = 'pb_store' THEN 'PB Store' ELSE 'PB Bazaar' END;
  END IF;

  IF public.is_bid_restricted(_uid) THEN RAISE EXCEPTION 'Account is currently restricted from bidding. Contact support.'; END IF;
  SELECT COUNT(*) INTO _unpaid FROM public.orders WHERE buyer_id = _uid AND payment_status = 'awaiting_payment';
  IF _unpaid > 0 THEN RAISE EXCEPTION 'Pay your pending order before bidding'; END IF;

  SELECT * INTO _l FROM public.listings WHERE id = _listing_id FOR UPDATE;
  IF _l.id IS NULL THEN RAISE EXCEPTION 'Listing not found'; END IF;
  IF _l.channel IN ('pb_store', 'bazaar') THEN
    RAISE EXCEPTION 'Bidding is not supported in %. Fixed-price purchases only.',
      CASE WHEN _l.channel = 'pb_store' THEN 'PB Store' ELSE 'PB Bazaar' END;
  END IF;

  IF _l.seller_id = _uid THEN RAISE EXCEPTION 'Sellers cannot bid on their own listing'; END IF;
  IF coalesce(_l.listing_type, 'buy_now') <> 'auction' AND NOT _l.is_auction THEN RAISE EXCEPTION 'Listing is not an auction'; END IF;
  IF _l.auction_status <> 'active' THEN RAISE EXCEPTION 'Auction is not active'; END IF;
  IF _l.auction_ends_at IS NOT NULL AND _l.auction_ends_at <= now() THEN RAISE EXCEPTION 'Auction ended'; END IF;
  IF _amount <= coalesce(_l.current_bid, _l.starting_bid, 0) THEN RAISE EXCEPTION 'Bid must be higher than current bid'; END IF;

  SELECT username INTO _username FROM public.profiles WHERE id = _uid;
  INSERT INTO public.listing_bids (listing_id, user_id, username, amount) VALUES (_listing_id, _uid, _username, _amount);
  UPDATE public.listings SET current_bid = _amount, top_bidder_id = _uid WHERE id = _listing_id;
  IF _l.auction_ends_at IS NOT NULL AND _l.auction_ends_at - now() < interval '30 seconds' THEN
    UPDATE public.listings SET auction_ends_at = now() + interval '60 seconds' WHERE id = _listing_id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'amount', _amount);
END; $$;

REVOKE ALL ON FUNCTION public.place_listing_bid(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_listing_bid(uuid, numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.check_listing_channel_transition() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_listing_bid_allowed() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_offer_allowed() FROM PUBLIC, anon, authenticated;