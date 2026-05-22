
-- 1. Broaden cleanup_prebid_on_vault_sold to also cancel active listings
--    and to fire on either status='sold' or is_sold flipping true.
CREATE OR REPLACE FUNCTION public.cleanup_prebid_on_vault_sold()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  became_sold boolean := (
    (NEW.status = 'sold' AND OLD.status IS DISTINCT FROM 'sold')
    OR (COALESCE(NEW.is_sold, false) = true AND COALESCE(OLD.is_sold, false) = false)
  );
BEGIN
  IF became_sold THEN
    -- Remove from scheduled Pre-Bid stores
    DELETE FROM public.auction_queue q
    USING public.live_streams s
    WHERE q.vault_card_id = NEW.id
      AND q.sale_type = 'prebid'
      AND q.stream_id = s.id
      AND s.status = 'scheduled';

    -- Cancel any active marketplace listing tied to this vault card
    UPDATE public.listings
       SET auction_status = 'cancelled',
           updated_at = now()
     WHERE vault_card_id = NEW.id
       AND auction_status = 'active';

    -- Keep status + is_sold in sync
    IF NEW.status <> 'sold' THEN NEW.status := 'sold'; END IF;
    IF COALESCE(NEW.is_sold, false) = false THEN NEW.is_sold := true; END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Use BEFORE UPDATE so the in-row status/is_sold sync sticks
DROP TRIGGER IF EXISTS trg_vault_sold_cleanup_prebid ON public.vault_cards;
CREATE TRIGGER trg_vault_sold_cleanup_prebid
BEFORE UPDATE ON public.vault_cards
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_prebid_on_vault_sold();

-- 2. When a marketplace listing sells, set vault_cards.status='sold'
--    in addition to is_sold=true so the cascade above fires.
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
          SET listed_listing_id = NULL,
              is_sold = true,
              status = 'sold',
              updated_at = now()
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
