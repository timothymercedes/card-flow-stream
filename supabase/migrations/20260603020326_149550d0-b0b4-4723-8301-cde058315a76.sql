-- Wishlist (Priority 3): users track cards they want; auto-notify on match.
CREATE TABLE public.wishlist_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  set_name TEXT,
  tcg_number TEXT,
  category TEXT,
  card_identity_id UUID,
  image_url TEXT,
  max_price NUMERIC,
  notify_sale BOOLEAN NOT NULL DEFAULT true,
  notify_trade BOOLEAN NOT NULL DEFAULT true,
  notify_live BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  last_notified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wishlist_items TO authenticated;
GRANT ALL ON public.wishlist_items TO service_role;

ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own wishlist - select"
  ON public.wishlist_items FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users manage their own wishlist - insert"
  ON public.wishlist_items FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage their own wishlist - update"
  ON public.wishlist_items FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users manage their own wishlist - delete"
  ON public.wishlist_items FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_wishlist_user ON public.wishlist_items(user_id);
CREATE INDEX idx_wishlist_match ON public.wishlist_items(lower(set_name), lower(tcg_number));

CREATE TRIGGER trg_wishlist_updated_at
  BEFORE UPDATE ON public.wishlist_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Notify wishlist owners when a matching marketplace/auction listing is created.
CREATE OR REPLACE FUNCTION public.match_wishlist_on_listing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w RECORD; lprice numeric;
BEGIN
  IF NEW.is_demo THEN RETURN NEW; END IF;
  lprice := COALESCE(NEW.buy_now_price, NEW.price, NEW.current_bid, NEW.starting_bid);
  FOR w IN
    SELECT wi.* FROM public.wishlist_items wi
    WHERE wi.notify_sale = true
      AND wi.user_id <> NEW.seller_id
      AND (
        (wi.tcg_number IS NOT NULL AND NEW.tcg_number IS NOT NULL
          AND lower(trim(wi.tcg_number)) = lower(trim(NEW.tcg_number))
          AND (wi.set_name IS NULL OR NEW.tcg_set IS NULL
               OR lower(trim(wi.set_name)) = lower(trim(NEW.tcg_set))))
        OR (wi.tcg_number IS NULL AND length(trim(wi.name)) > 2
            AND NEW.title ILIKE '%' || wi.name || '%')
      )
      AND (wi.max_price IS NULL OR lprice IS NULL OR lprice <= wi.max_price)
  LOOP
    PERFORM public.notify_user(
      _user_id => w.user_id,
      _category => 'system',
      _body => 'A card on your wishlist "' || w.name || '" was just listed'
               || COALESCE(' for $' || lprice::text, '') || '.',
      _type => 'wishlist_match',
      _link => '/market/' || NEW.id);
  END LOOP;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_match_wishlist_listing
  AFTER INSERT ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.match_wishlist_on_listing();

-- Notify wishlist owners when a vault card becomes available for trade.
CREATE OR REPLACE FUNCTION public.match_wishlist_on_trade()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w RECORD; uname text; became boolean;
BEGIN
  became := (NEW.accept_trades OR NEW.trade_plus_cash OR NEW.accept_offers)
    AND NOT (COALESCE(OLD.accept_trades,false) OR COALESCE(OLD.trade_plus_cash,false) OR COALESCE(OLD.accept_offers,false));
  IF NOT became OR NEW.is_sold THEN RETURN NEW; END IF;
  SELECT username INTO uname FROM public.profiles WHERE id = NEW.user_id;
  FOR w IN
    SELECT wi.* FROM public.wishlist_items wi
    WHERE wi.notify_trade = true
      AND wi.user_id <> NEW.user_id
      AND (
        (wi.tcg_number IS NOT NULL AND NEW.tcg_number IS NOT NULL
          AND lower(trim(wi.tcg_number)) = lower(trim(NEW.tcg_number))
          AND (wi.set_name IS NULL OR NEW.tcg_set IS NULL
               OR lower(trim(wi.set_name)) = lower(trim(NEW.tcg_set))))
        OR (wi.tcg_number IS NULL AND length(trim(wi.name)) > 2
            AND NEW.name ILIKE '%' || wi.name || '%')
      )
  LOOP
    PERFORM public.notify_user(
      _user_id => w.user_id,
      _category => 'system',
      _body => 'A wishlist card "' || w.name || '" is now available for trade.',
      _type => 'wishlist_trade',
      _link => COALESCE('/seller/' || uname, '/trades'));
  END LOOP;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_match_wishlist_trade
  AFTER UPDATE ON public.vault_cards
  FOR EACH ROW EXECUTE FUNCTION public.match_wishlist_on_trade();