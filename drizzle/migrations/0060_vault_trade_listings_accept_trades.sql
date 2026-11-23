CREATE OR REPLACE FUNCTION public.listings_trade_type_accepts_trades()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF NEW.listing_type = 'trade' THEN NEW.accepts_trades := true; END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_listings_trade_type_accepts_trades ON public.listings;
CREATE TRIGGER trg_listings_trade_type_accepts_trades BEFORE INSERT OR UPDATE OF listing_type, accepts_trades ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.listings_trade_type_accepts_trades();
UPDATE public.listings SET accepts_trades = true WHERE listing_type = 'trade' AND accepts_trades = false;