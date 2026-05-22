
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS vault_card_id uuid REFERENCES public.vault_cards(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_listings_vault_card_id ON public.listings(vault_card_id);

ALTER TABLE public.vault_cards
  ADD COLUMN IF NOT EXISTS listed_listing_id uuid,
  ADD COLUMN IF NOT EXISTS is_sold boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_listing_per_vault_card
  ON public.listings (vault_card_id)
  WHERE vault_card_id IS NOT NULL AND auction_status = 'active';

CREATE OR REPLACE FUNCTION public.sync_vault_listing_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.vault_card_id IS NOT NULL AND NEW.auction_status = 'active' THEN
      UPDATE public.vault_cards
        SET listed_listing_id = NEW.id
        WHERE id = NEW.vault_card_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.vault_card_id IS NOT NULL AND NEW.auction_status IS DISTINCT FROM OLD.auction_status THEN
      IF NEW.auction_status = 'sold' THEN
        UPDATE public.vault_cards
          SET listed_listing_id = NULL, is_sold = true
          WHERE id = NEW.vault_card_id;
      ELSIF NEW.auction_status IN ('cancelled','expired','ended') THEN
        UPDATE public.vault_cards
          SET listed_listing_id = NULL
          WHERE id = NEW.vault_card_id AND listed_listing_id = NEW.id;
      ELSIF NEW.auction_status = 'active' THEN
        UPDATE public.vault_cards
          SET listed_listing_id = NEW.id
          WHERE id = NEW.vault_card_id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_vault_listing_link ON public.listings;
CREATE TRIGGER trg_sync_vault_listing_link
  AFTER INSERT OR UPDATE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.sync_vault_listing_link();
