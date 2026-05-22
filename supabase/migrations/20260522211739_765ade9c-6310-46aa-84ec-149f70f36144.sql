
ALTER TABLE public.live_streams
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz;

ALTER TABLE public.auction_queue
  ADD COLUMN IF NOT EXISTS voice_trigger text,
  ADD COLUMN IF NOT EXISTS vault_card_id uuid REFERENCES public.vault_cards(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_auction_queue_vault_card ON public.auction_queue(vault_card_id);
CREATE INDEX IF NOT EXISTS idx_live_streams_scheduled_for ON public.live_streams(scheduled_for) WHERE scheduled_for IS NOT NULL;

CREATE OR REPLACE FUNCTION public.mark_vault_card_sold_on_queue_sold()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.vault_card_id IS NOT NULL
     AND NEW.sold_to IS NOT NULL
     AND (OLD.sold_to IS NULL OR OLD.sold_to <> NEW.sold_to) THEN
    UPDATE public.vault_cards
       SET status = 'sold', updated_at = now()
     WHERE id = NEW.vault_card_id
       AND status <> 'sold';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auction_queue_mark_vault_sold ON public.auction_queue;
CREATE TRIGGER trg_auction_queue_mark_vault_sold
AFTER UPDATE OF sold_to ON public.auction_queue
FOR EACH ROW
EXECUTE FUNCTION public.mark_vault_card_sold_on_queue_sold();
