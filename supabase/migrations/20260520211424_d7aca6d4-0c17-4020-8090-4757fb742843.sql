
-- Phase 1: Auto-unblock buyer when host cancels unpaid order
-- Trigger fires on orders status/payment_status transitions to cancelled/refunded.
-- Only removes the live_bid_blocks row if the buyer has no OTHER unpaid/failed orders in that stream.

CREATE OR REPLACE FUNCTION public.auto_unblock_on_order_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now_cancelled boolean;
  v_was_cancelled boolean;
  v_remaining_unpaid int;
BEGIN
  -- Treat as "cancelled" if status is cancelled OR payment_status is cancelled/refunded.
  v_now_cancelled := (NEW.status IN ('cancelled','canceled','refunded'))
                  OR (NEW.payment_status IN ('cancelled','canceled','refunded'));
  v_was_cancelled := (OLD.status IN ('cancelled','canceled','refunded'))
                  OR (OLD.payment_status IN ('cancelled','canceled','refunded'));

  IF v_now_cancelled AND NOT v_was_cancelled AND NEW.stream_id IS NOT NULL THEN
    -- Count remaining unpaid/failed orders for this buyer in this stream.
    SELECT COUNT(*) INTO v_remaining_unpaid
    FROM public.orders
    WHERE stream_id = NEW.stream_id
      AND buyer_id = NEW.buyer_id
      AND id <> NEW.id
      AND payment_status IN ('failed','chargeback','awaiting_payment','processing','pending');

    IF v_remaining_unpaid = 0 THEN
      DELETE FROM public.live_bid_blocks
      WHERE stream_id = NEW.stream_id
        AND user_id = NEW.buyer_id;

      -- Notify the buyer that they can resume bidding.
      INSERT INTO public.notifications (user_id, type, body, link)
      VALUES (
        NEW.buyer_id,
        'payment',
        'Your unpaid order was cancelled by the host. You can place bids again.',
        '/live/' || NEW.stream_id::text
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_unblock_on_order_cancel ON public.orders;
CREATE TRIGGER trg_auto_unblock_on_order_cancel
AFTER UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.auto_unblock_on_order_cancel();
