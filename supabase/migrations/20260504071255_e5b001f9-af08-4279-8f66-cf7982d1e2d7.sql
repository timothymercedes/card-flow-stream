
-- Listings: reserve price, auction outcome status, expiry
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS reserve_price numeric,
  ADD COLUMN IF NOT EXISTS auction_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  ADD COLUMN IF NOT EXISTS top_bidder_id uuid;

-- Offers: expiry + uniqueness (one buyer can't repeat the same exact $ amount on the same listing)
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '48 hours');

CREATE UNIQUE INDEX IF NOT EXISTS offers_unique_buyer_listing_amount
  ON public.offers (listing_id, buyer_id, amount)
  WHERE status = 'pending';

-- Validate offer amount > 1 via trigger (CHECK constraints can't reference future updates flexibly, but here it's fine; using trigger per guidelines)
CREATE OR REPLACE FUNCTION public.validate_offer_amount()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.amount IS NULL OR NEW.amount <= 1 THEN
    RAISE EXCEPTION 'Offer must be greater than $1';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_offer_amount ON public.offers;
CREATE TRIGGER trg_validate_offer_amount
  BEFORE INSERT OR UPDATE ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.validate_offer_amount();
