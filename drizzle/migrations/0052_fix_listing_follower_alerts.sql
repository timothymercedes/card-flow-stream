CREATE OR REPLACE FUNCTION public.notify_followers_on_new_listing()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  seller_name text;
  is_new_auction boolean := COALESCE(NEW.is_auction, false) = true;
BEGIN
  IF COALESCE(NEW.is_demo, false) THEN
    RETURN NEW;
  END IF;
  SELECT username INTO seller_name FROM public.profiles WHERE id = NEW.seller_id;

  INSERT INTO public.notifications (user_id, type, body, link, sender_id)
  SELECT f.follower_id,
         'listing',
         COALESCE(seller_name, 'A seller you follow') || ' listed: ' || NEW.title,
         '/market/' || NEW.id,
         NEW.seller_id
  FROM public.follows f
  WHERE f.followee_id = NEW.seller_id
    AND COALESCE(f.notify_new_listing, false) = true;

  IF is_new_auction THEN
    INSERT INTO public.notifications (user_id, type, body, link, sender_id)
    SELECT f.follower_id,
           'listing',
           COALESCE(seller_name, 'A seller you follow') || ' started an auction: ' || NEW.title,
           '/market/' || NEW.id,
           NEW.seller_id
    FROM public.follows f
    WHERE f.followee_id = NEW.seller_id
      AND COALESCE(f.notify_auction_start, false) = true;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW; -- alerts must never block listing changes
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_followers_on_auction_start()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  seller_name text;
BEGIN
  IF COALESCE(NEW.is_demo, false) THEN RETURN NEW; END IF;
  IF COALESCE(OLD.is_auction, false) = false
     AND COALESCE(NEW.is_auction, false) = true THEN
    SELECT username INTO seller_name FROM public.profiles WHERE id = NEW.seller_id;
    INSERT INTO public.notifications (user_id, type, body, link, sender_id)
    SELECT f.follower_id,
           'listing',
           COALESCE(seller_name, 'A seller you follow') || ' started an auction: ' || NEW.title,
           '/market/' || NEW.id,
           NEW.seller_id
    FROM public.follows f
    WHERE f.followee_id = NEW.seller_id
      AND COALESCE(f.notify_auction_start, false) = true;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW; -- alerts must never block listing changes
END;
$function$;

CREATE OR REPLACE FUNCTION public.listing_close_followups()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE r record;
BEGIN
  IF NEW.closed_at IS NOT NULL AND OLD.closed_at IS NULL THEN
    BEGIN
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
    EXCEPTION WHEN OTHERS THEN NULL; -- alerts must never undo a completed sale
    END;
    UPDATE public.offers SET status = 'rejected'
     WHERE listing_id = NEW.id AND status = 'pending';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.listing_close_followups() FROM PUBLIC, anon, authenticated;