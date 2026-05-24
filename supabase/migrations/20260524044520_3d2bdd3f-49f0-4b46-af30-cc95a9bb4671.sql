
-- Notify followers when a seller publishes a new listing or starts an auction.
CREATE OR REPLACE FUNCTION public.notify_followers_on_new_listing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seller_name text;
  is_new_auction boolean := COALESCE(NEW.is_auction, false) = true;
BEGIN
  IF COALESCE(NEW.is_demo, false) THEN
    RETURN NEW;
  END IF;
  SELECT username INTO seller_name FROM public.profiles WHERE id = NEW.seller_id;

  -- New listing notification
  INSERT INTO public.notifications (user_id, type, body, link, sender_id)
  SELECT f.follower_id,
         'seller_new_listing',
         COALESCE(seller_name, 'A seller you follow') || ' listed: ' || NEW.title,
         '/market/' || NEW.id,
         NEW.seller_id
  FROM public.follows f
  WHERE f.followee_id = NEW.seller_id
    AND COALESCE(f.notify_new_listing, false) = true;

  -- Auction-start notification (separate toggle)
  IF is_new_auction THEN
    INSERT INTO public.notifications (user_id, type, body, link, sender_id)
    SELECT f.follower_id,
           'seller_auction_start',
           COALESCE(seller_name, 'A seller you follow') || ' started an auction: ' || NEW.title,
           '/market/' || NEW.id,
           NEW.seller_id
    FROM public.follows f
    WHERE f.followee_id = NEW.seller_id
      AND COALESCE(f.notify_auction_start, false) = true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_followers_on_new_listing ON public.listings;
CREATE TRIGGER trg_notify_followers_on_new_listing
AFTER INSERT ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.notify_followers_on_new_listing();

-- Also fire when an existing listing transitions into an active auction.
CREATE OR REPLACE FUNCTION public.notify_followers_on_auction_start()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seller_name text;
BEGIN
  IF COALESCE(NEW.is_demo, false) THEN RETURN NEW; END IF;
  IF COALESCE(OLD.is_auction, false) = false
     AND COALESCE(NEW.is_auction, false) = true THEN
    SELECT username INTO seller_name FROM public.profiles WHERE id = NEW.seller_id;
    INSERT INTO public.notifications (user_id, type, body, link, sender_id)
    SELECT f.follower_id,
           'seller_auction_start',
           COALESCE(seller_name, 'A seller you follow') || ' started an auction: ' || NEW.title,
           '/market/' || NEW.id,
           NEW.seller_id
    FROM public.follows f
    WHERE f.followee_id = NEW.seller_id
      AND COALESCE(f.notify_auction_start, false) = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_followers_on_auction_start ON public.listings;
CREATE TRIGGER trg_notify_followers_on_auction_start
AFTER UPDATE OF is_auction ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.notify_followers_on_auction_start();
