ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS accepts_trades boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_by text,
  ADD COLUMN IF NOT EXISTS closed_winner_id uuid;

ALTER TABLE public.listings ADD CONSTRAINT listings_closed_by_valid
  CHECK (closed_by IS NULL OR closed_by IN ('buy_now','offer','auction','trade'));
ALTER TABLE public.listings ADD CONSTRAINT listings_trades_marketplace_only
  CHECK (channel = 'marketplace' OR accepts_trades IS FALSE);

-- Followups when a listing closes: void stale offers, notify interested members.
CREATE OR REPLACE FUNCTION public.listing_close_followups()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE r record;
BEGIN
  IF NEW.closed_at IS NOT NULL AND OLD.closed_at IS NULL THEN
    FOR r IN
      SELECT DISTINCT uid FROM (
        SELECT b.user_id AS uid FROM public.listing_bids b WHERE b.listing_id = NEW.id
        UNION SELECT o.buyer_id FROM public.offers o WHERE o.listing_id = NEW.id AND o.status = 'pending'
      ) s WHERE uid IS NOT NULL AND uid IS DISTINCT FROM NEW.closed_winner_id
    LOOP
      PERFORM public.notify_user(_user_id => r.uid, _type => 'listing', _category => 'marketplace',
        _body => format('"%s" is no longer available — it sold another way.', NEW.title),
        _link => '/market/' || NEW.id::text);
    END LOOP;
    UPDATE public.offers SET status = 'rejected'
     WHERE listing_id = NEW.id AND status = 'pending';
  END IF;
  RETURN NEW;
END $$;

-- Close automatically when Buy Now sells the last unit.
CREATE OR REPLACE FUNCTION public.listing_close_on_sellout()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  IF NEW.closed_at IS NULL AND NEW.sold_count >= NEW.quantity AND OLD.sold_count < OLD.quantity THEN
    NEW.closed_at := now();
    NEW.closed_by := 'buy_now';
    IF NEW.is_auction AND NEW.auction_status = 'active' THEN NEW.auction_status := 'sold_early'; END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_listing_close_on_sellout BEFORE UPDATE OF sold_count ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.listing_close_on_sellout();
CREATE TRIGGER trg_listing_close_followups AFTER UPDATE OF closed_at ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.listing_close_followups();

-- Refuse bids and offers on closed listings.
CREATE OR REPLACE FUNCTION public.listing_reject_if_closed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE _closed timestamptz; _offers boolean;
BEGIN
  SELECT closed_at, accepts_offers INTO _closed, _offers FROM public.listings WHERE id = NEW.listing_id FOR SHARE;
  IF _closed IS NOT NULL THEN RAISE EXCEPTION 'This listing has already sold'; END IF;
  IF TG_TABLE_NAME = 'offers' AND TG_OP = 'INSERT' AND _offers IS NOT TRUE THEN
    RAISE EXCEPTION 'This seller is not accepting offers on this listing';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_bids_reject_closed BEFORE INSERT ON public.listing_bids
  FOR EACH ROW EXECUTE FUNCTION public.listing_reject_if_closed();
CREATE TRIGGER trg_offers_reject_closed BEFORE INSERT ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.listing_reject_if_closed();

-- Orders: only the winner may order a closed listing; Buy Now ends at first bid.
CREATE OR REPLACE FUNCTION public.listing_guard_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE _l public.listings%ROWTYPE;
BEGIN
  IF NEW.listing_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO _l FROM public.listings WHERE id = NEW.listing_id FOR UPDATE;
  IF _l.id IS NULL OR _l.channel <> 'marketplace' THEN RETURN NEW; END IF;
  IF _l.closed_at IS NOT NULL AND NEW.buyer_id IS DISTINCT FROM _l.closed_winner_id THEN
    RAISE EXCEPTION 'This listing has already sold';
  END IF;
  IF _l.closed_at IS NULL AND _l.is_auction AND _l.auction_status = 'active'
     AND (_l.auction_ends_at IS NULL OR _l.auction_ends_at > now())
     AND EXISTS (SELECT 1 FROM public.listing_bids WHERE listing_id = _l.id) THEN
    RAISE EXCEPTION 'Buy Now ended once bidding started';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_orders_listing_guard BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.listing_guard_order();

-- Seller accepts one offer atomically.
CREATE OR REPLACE FUNCTION public.accept_listing_offer(_offer_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE _uid uuid := auth.uid(); _o public.offers%ROWTYPE; _l public.listings%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _o FROM public.offers WHERE id = _offer_id;
  IF _o.id IS NULL THEN RAISE EXCEPTION 'Offer not found'; END IF;
  SELECT * INTO _l FROM public.listings WHERE id = _o.listing_id FOR UPDATE;
  IF _l.seller_id <> _uid THEN RAISE EXCEPTION 'Only the seller can accept offers'; END IF;
  IF _l.closed_at IS NOT NULL THEN RAISE EXCEPTION 'This listing has already sold'; END IF;
  SELECT * INTO _o FROM public.offers WHERE id = _offer_id FOR UPDATE;
  IF _o.status <> 'pending' THEN RAISE EXCEPTION 'Offer is no longer pending'; END IF;
  IF _o.expires_at IS NOT NULL AND _o.expires_at <= now() THEN RAISE EXCEPTION 'Offer has expired'; END IF;
  UPDATE public.offers SET status = 'accepted' WHERE id = _offer_id;
  UPDATE public.listings SET closed_at = now(), closed_by = 'offer', closed_winner_id = _o.buyer_id,
    auction_status = CASE WHEN is_auction AND auction_status = 'active' THEN 'sold_early' ELSE auction_status END
   WHERE id = _l.id;
  PERFORM public.notify_user(_user_id => _o.buyer_id, _type => 'offer', _category => 'marketplace',
    _body => format('Your offer of $%s on "%s" was accepted — complete checkout!', _o.amount, _l.title),
    _link => '/market/' || _l.id::text);
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.accept_listing_offer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_listing_offer(uuid) TO authenticated;

-- Accepting a trade locks the card; close any open Marketplace listing for it.
CREATE OR REPLACE FUNCTION public.listing_close_on_trade_lock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  UPDATE public.listings SET closed_at = now(), closed_by = 'trade',
    auction_status = CASE WHEN is_auction AND auction_status = 'active' THEN 'sold_early' ELSE auction_status END
   WHERE vault_card_id = NEW.vault_card_id AND channel = 'marketplace' AND closed_at IS NULL;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_trade_lock_closes_listing AFTER INSERT ON public.trade_card_locks
  FOR EACH ROW EXECUTE FUNCTION public.listing_close_on_trade_lock();

REVOKE ALL ON FUNCTION public.listing_close_followups(), public.listing_close_on_sellout(),
  public.listing_reject_if_closed(), public.listing_guard_order(), public.listing_close_on_trade_lock()
  FROM PUBLIC, anon, authenticated;