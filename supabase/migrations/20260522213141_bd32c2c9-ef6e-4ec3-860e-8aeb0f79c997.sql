
-- 1) Recurrence fields on live_streams
ALTER TABLE public.live_streams
  ADD COLUMN IF NOT EXISTS recurrence text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS recurrence_until timestamptz NULL,
  ADD COLUMN IF NOT EXISTS recurrence_parent_id uuid NULL REFERENCES public.live_streams(id) ON DELETE SET NULL;

ALTER TABLE public.live_streams
  DROP CONSTRAINT IF EXISTS live_streams_recurrence_check;
ALTER TABLE public.live_streams
  ADD CONSTRAINT live_streams_recurrence_check
  CHECK (recurrence IN ('none','daily','weekly','monthly'));

-- 2) When a vault card flips to sold, remove from any *scheduled* prebid queues.
CREATE OR REPLACE FUNCTION public.cleanup_prebid_on_vault_sold()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'sold' AND (OLD.status IS DISTINCT FROM 'sold') THEN
    DELETE FROM public.auction_queue q
    USING public.live_streams s
    WHERE q.vault_card_id = NEW.id
      AND q.sale_type = 'prebid'
      AND q.stream_id = s.id
      AND s.status = 'scheduled';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vault_sold_cleanup_prebid ON public.vault_cards;
CREATE TRIGGER trg_vault_sold_cleanup_prebid
AFTER UPDATE OF status ON public.vault_cards
FOR EACH ROW EXECUTE FUNCTION public.cleanup_prebid_on_vault_sold();

-- 3) When a scheduled recurring stream transitions to live, spawn the next occurrence.
CREATE OR REPLACE FUNCTION public.spawn_next_recurrence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_at timestamptz;
  new_id uuid;
BEGIN
  IF NEW.recurrence IS NULL OR NEW.recurrence = 'none' THEN RETURN NEW; END IF;
  IF NEW.scheduled_for IS NULL THEN RETURN NEW; END IF;
  IF NOT (OLD.status = 'scheduled' AND NEW.status IN ('live','ended')) THEN RETURN NEW; END IF;

  next_at := CASE NEW.recurrence
    WHEN 'daily' THEN NEW.scheduled_for + interval '1 day'
    WHEN 'weekly' THEN NEW.scheduled_for + interval '7 days'
    WHEN 'monthly' THEN NEW.scheduled_for + interval '1 month'
  END;

  IF NEW.recurrence_until IS NOT NULL AND next_at > NEW.recurrence_until THEN
    RETURN NEW;
  END IF;

  -- Avoid duplicate spawn
  IF EXISTS (SELECT 1 FROM public.live_streams WHERE recurrence_parent_id = COALESCE(NEW.recurrence_parent_id, NEW.id) AND scheduled_for = next_at) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.live_streams (
    seller_id, title, category, stream_type, tcg_tags, item_description,
    listing_type, starting_bid, current_bid, current_item, min_bid_increment,
    status, is_active, scheduled_for, quick_start_enabled, default_timer_sec,
    default_starting_bid, default_condition, recurrence, recurrence_until, recurrence_parent_id
  ) VALUES (
    NEW.seller_id, NEW.title, NEW.category, NEW.stream_type, NEW.tcg_tags, NEW.item_description,
    NEW.listing_type, NEW.starting_bid, NEW.starting_bid, NEW.current_item, NEW.min_bid_increment,
    'scheduled', false, next_at, NEW.quick_start_enabled, NEW.default_timer_sec,
    NEW.default_starting_bid, NEW.default_condition, NEW.recurrence, NEW.recurrence_until,
    COALESCE(NEW.recurrence_parent_id, NEW.id)
  ) RETURNING id INTO new_id;

  -- Carry over prebid items whose vault cards are still available (or have no vault link)
  INSERT INTO public.auction_queue (
    stream_id, host_id, position, title, quantity, image_url, sale_type,
    starting_bid, duration_seconds, snipe_price, buy_now_price, voice_trigger, vault_card_id
  )
  SELECT new_id, q.host_id, q.position, q.title, q.quantity, q.image_url, q.sale_type,
         q.starting_bid, q.duration_seconds, q.snipe_price, q.buy_now_price, q.voice_trigger, q.vault_card_id
  FROM public.auction_queue q
  LEFT JOIN public.vault_cards v ON v.id = q.vault_card_id
  WHERE q.stream_id = NEW.id
    AND q.sale_type = 'prebid'
    AND (q.vault_card_id IS NULL OR v.status = 'available');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_spawn_next_recurrence ON public.live_streams;
CREATE TRIGGER trg_spawn_next_recurrence
AFTER UPDATE OF status ON public.live_streams
FOR EACH ROW EXECUTE FUNCTION public.spawn_next_recurrence();
