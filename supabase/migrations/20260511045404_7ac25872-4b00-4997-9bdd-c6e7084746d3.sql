
-- 1. live_bids history table
CREATE TABLE IF NOT EXISTS public.live_bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id uuid NOT NULL REFERENCES public.live_streams(id) ON DELETE CASCADE,
  bidder_id uuid NOT NULL,
  bidder_username text,
  amount numeric NOT NULL,
  round_number integer,
  was_anti_snipe boolean NOT NULL DEFAULT false,
  was_sudden_death boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_live_bids_stream_created ON public.live_bids (stream_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_bids_bidder ON public.live_bids (bidder_id, created_at DESC);
ALTER TABLE public.live_bids ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "live_bids_select_anyone" ON public.live_bids;
CREATE POLICY "live_bids_select_anyone" ON public.live_bids
  FOR SELECT TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "live_bids_no_client_writes" ON public.live_bids;
CREATE POLICY "live_bids_no_client_writes" ON public.live_bids
  FOR INSERT TO authenticated
  WITH CHECK (false);

-- 2. Atomic place_live_bid RPC
CREATE OR REPLACE FUNCTION public.place_live_bid(_stream_id uuid, _amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _username text;
  _s public.live_streams%ROWTYPE;
  _unpaid int;
  _min_inc numeric;
  _cur numeric;
  _remaining_ms bigint;
  _extended boolean := false;
  _sd_win boolean := false;
  _new_ends timestamptz;
  _exts int;
  _sd_sec int;
  _sd_max int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Invalid bid amount'; END IF;

  -- Block bidders with unpaid orders
  SELECT COUNT(*) INTO _unpaid FROM public.orders
   WHERE buyer_id = _uid AND payment_status = 'awaiting_payment';
  IF _unpaid > 0 THEN RAISE EXCEPTION 'Pay your pending order before bidding'; END IF;

  -- Lock stream row
  SELECT * INTO _s FROM public.live_streams WHERE id = _stream_id FOR UPDATE;
  IF _s.id IS NULL THEN RAISE EXCEPTION 'Stream not found'; END IF;
  IF _s.seller_id = _uid THEN RAISE EXCEPTION 'Sellers cannot bid on their own stream'; END IF;
  IF _s.status <> 'live' THEN RAISE EXCEPTION 'Stream is not live'; END IF;
  IF _s.ends_at IS NULL OR _s.ends_at <= now() THEN RAISE EXCEPTION 'Auction not running'; END IF;
  IF public.is_bid_blocked(_stream_id, _uid) THEN RAISE EXCEPTION 'You are blocked from bidding here'; END IF;

  _cur := COALESCE(_s.current_bid, 0);
  _min_inc := GREATEST(COALESCE(_s.min_bid_increment, 1), 0.01);
  IF _amount < _cur + _min_inc THEN
    RAISE EXCEPTION 'Bid must be at least $%', (_cur + _min_inc)::text;
  END IF;

  SELECT username INTO _username FROM public.profiles WHERE id = _uid;

  -- Anti-snipe / sudden death logic (mirrors client)
  _remaining_ms := EXTRACT(EPOCH FROM (_s.ends_at - now())) * 1000;
  _exts := COALESCE(_s.snipe_extends, 0);
  _sd_sec := GREATEST(1, COALESCE(_s.sudden_death_seconds_added, 5));
  _sd_max := GREATEST(1, COALESCE(_s.sudden_death_max_triggers, 3));

  IF COALESCE(_s.sudden_death_active, false) THEN
    _new_ends := now() + interval '1200 milliseconds';
    _sd_win := true;
    UPDATE public.live_streams
       SET current_bid = _amount, current_bidder_id = _uid,
           ends_at = _new_ends, sudden_death_active = false
     WHERE id = _stream_id;
  ELSIF COALESCE(_s.sudden_death_enabled, false) AND _remaining_ms > 0 AND _remaining_ms <= 3000 THEN
    _new_ends := GREATEST(_s.ends_at, now()) + make_interval(secs => _sd_sec);
    _extended := true;
    UPDATE public.live_streams
       SET current_bid = _amount, current_bidder_id = _uid,
           ends_at = _new_ends, snipe_extends = _exts + 1,
           sudden_death_active = ((_exts + 1) >= _sd_max)
     WHERE id = _stream_id;
  ELSE
    UPDATE public.live_streams
       SET current_bid = _amount, current_bidder_id = _uid
     WHERE id = _stream_id;
  END IF;

  -- History
  INSERT INTO public.live_bids (stream_id, bidder_id, bidder_username, amount, round_number, was_anti_snipe, was_sudden_death)
  VALUES (_stream_id, _uid, _username, _amount, _s.round_number, _extended, _sd_win);

  -- Audit log
  INSERT INTO public.audit_logs (actor_id, actor_username, action, target_type, target_id, meta)
  VALUES (_uid, _username, 'live_bid_placed', 'live_stream', _stream_id,
          jsonb_build_object('amount', _amount, 'prev_bid', _cur, 'extended', _extended, 'sudden_death_win', _sd_win));

  RETURN jsonb_build_object('ok', true, 'amount', _amount, 'extended', _extended, 'sudden_death_win', _sd_win);
END;
$$;

GRANT EXECUTE ON FUNCTION public.place_live_bid(uuid, numeric) TO authenticated;

-- 3. Audit trigger on live_streams (winner locks, status to ended)
CREATE OR REPLACE FUNCTION public.audit_live_stream_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid();
BEGIN
  IF NEW.winner_id IS DISTINCT FROM OLD.winner_id AND NEW.winner_id IS NOT NULL THEN
    INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, meta)
    VALUES (_actor, 'auction_winner_locked', 'live_stream', NEW.id,
            jsonb_build_object('winner_id', NEW.winner_id, 'winning_bid', NEW.winning_bid,
                               'round_number', NEW.round_number, 'seller_id', NEW.seller_id));
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'ended' THEN
    INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, meta)
    VALUES (_actor, 'stream_ended', 'live_stream', NEW.id,
            jsonb_build_object('reason', NEW.auto_end_reason, 'final_winner', NEW.winner_id));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_audit_live_stream_change ON public.live_streams;
CREATE TRIGGER trg_audit_live_stream_change
  AFTER UPDATE ON public.live_streams
  FOR EACH ROW EXECUTE FUNCTION public.audit_live_stream_change();

-- 4. Audit trigger on orders (payment_status transitions)
CREATE OR REPLACE FUNCTION public.audit_order_payment_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, meta)
    VALUES (_actor, 'order_created', 'order', NEW.id,
            jsonb_build_object('buyer_id', NEW.buyer_id, 'seller_id', NEW.seller_id,
                               'amount', NEW.amount, 'stream_id', NEW.stream_id, 'listing_id', NEW.listing_id));
    RETURN NEW;
  END IF;
  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, meta)
    VALUES (_actor, 'order_payment_' || NEW.payment_status, 'order', NEW.id,
            jsonb_build_object('from', OLD.payment_status, 'to', NEW.payment_status,
                               'amount', NEW.amount, 'buyer_id', NEW.buyer_id, 'seller_id', NEW.seller_id));
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, meta)
    VALUES (_actor, 'order_status_' || NEW.status, 'order', NEW.id,
            jsonb_build_object('from', OLD.status, 'to', NEW.status));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_audit_order_change ON public.orders;
CREATE TRIGGER trg_audit_order_change
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.audit_order_payment_change();

-- 5. Prevent duplicate live-auction orders for same winner+bid+stream
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_stream_winner_bid
  ON public.orders (stream_id, buyer_id, amount)
  WHERE stream_id IS NOT NULL;
