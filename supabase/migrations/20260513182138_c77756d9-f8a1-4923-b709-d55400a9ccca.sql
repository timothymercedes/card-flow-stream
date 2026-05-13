
-- Add enforcement columns FIRST so functions can reference them
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bid_restricted_until timestamptz,
  ADD COLUMN IF NOT EXISTS bid_restricted_reason text,
  ADD COLUMN IF NOT EXISTS unpaid_strikes integer NOT NULL DEFAULT 0;

-- seller_reviews enhancements
ALTER TABLE public.seller_reviews
  ADD COLUMN IF NOT EXISTS communication_rating integer,
  ADD COLUMN IF NOT EXISTS accuracy_rating integer,
  ADD COLUMN IF NOT EXISTS verified_purchase boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS verified_live_auction boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stream_id uuid;
DO $$ BEGIN
  ALTER TABLE public.seller_reviews ADD CONSTRAINT seller_reviews_communication_rating_chk CHECK (communication_rating IS NULL OR communication_rating BETWEEN 1 AND 5);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.seller_reviews ADD CONSTRAINT seller_reviews_accuracy_rating_chk CHECK (accuracy_rating IS NULL OR accuracy_rating BETWEEN 1 AND 5);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
UPDATE public.seller_reviews sr SET verified_live_auction = true, stream_id = COALESCE(sr.stream_id, o.stream_id)
FROM public.orders o WHERE sr.order_id = o.id AND o.stream_id IS NOT NULL AND sr.verified_live_auction = false;

-- review_responses
CREATE TABLE IF NOT EXISTS public.review_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.seller_reviews(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  author_role text NOT NULL CHECK (author_role IN ('seller','buyer')),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, author_id)
);
CREATE INDEX IF NOT EXISTS idx_review_responses_review ON public.review_responses(review_id);
ALTER TABLE public.review_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "responses readable by all" ON public.review_responses;
CREATE POLICY "responses readable by all" ON public.review_responses FOR SELECT USING (true);
DROP POLICY IF EXISTS "seller or buyer can respond" ON public.review_responses;
CREATE POLICY "seller or buyer can respond" ON public.review_responses
  FOR INSERT WITH CHECK (auth.uid() = author_id AND (
    (author_role='seller' AND EXISTS (SELECT 1 FROM public.seller_reviews r WHERE r.id=review_id AND r.seller_id=auth.uid()))
    OR (author_role='buyer' AND EXISTS (SELECT 1 FROM public.seller_reviews r WHERE r.id=review_id AND r.buyer_id=auth.uid()))
  ) AND length(btrim(body)) BETWEEN 1 AND 1500);
DROP POLICY IF EXISTS "author can update own response" ON public.review_responses;
CREATE POLICY "author can update own response" ON public.review_responses FOR UPDATE USING (auth.uid()=author_id) WITH CHECK (auth.uid()=author_id);
DROP POLICY IF EXISTS "author can delete own response" ON public.review_responses;
CREATE POLICY "author can delete own response" ON public.review_responses FOR DELETE USING (auth.uid()=author_id OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE OR REPLACE FUNCTION public.touch_review_response_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_review_response_touch ON public.review_responses;
CREATE TRIGGER trg_review_response_touch BEFORE UPDATE ON public.review_responses
  FOR EACH ROW EXECUTE FUNCTION public.touch_review_response_updated_at();

-- review_reports
CREATE TABLE IF NOT EXISTS public.review_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.seller_reviews(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL,
  reason text NOT NULL, details text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','dismissed','actioned')),
  resolved_by uuid, resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, reporter_id)
);
CREATE INDEX IF NOT EXISTS idx_review_reports_status ON public.review_reports(status);
ALTER TABLE public.review_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "report own" ON public.review_reports;
CREATE POLICY "report own" ON public.review_reports FOR INSERT WITH CHECK (auth.uid()=reporter_id AND length(btrim(reason)) BETWEEN 1 AND 64 AND length(COALESCE(details,'')) <= 1000);
DROP POLICY IF EXISTS "reporter or admin reads" ON public.review_reports;
CREATE POLICY "reporter or admin reads" ON public.review_reports FOR SELECT USING (auth.uid()=reporter_id OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'moderator'));
DROP POLICY IF EXISTS "admin updates" ON public.review_reports;
CREATE POLICY "admin updates" ON public.review_reports FOR UPDATE USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'moderator'));

-- buyer_review_queue
CREATE TABLE IF NOT EXISTS public.buyer_review_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL,
  reason text NOT NULL,
  unpaid_strikes integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','waived','extended','banned','restored')),
  resolved_by uuid, resolution_notes text, resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_buyer_review_queue_status ON public.buyer_review_queue(status);
CREATE INDEX IF NOT EXISTS idx_buyer_review_queue_buyer  ON public.buyer_review_queue(buyer_id);
ALTER TABLE public.buyer_review_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "queue admin read" ON public.buyer_review_queue;
CREATE POLICY "queue admin read" ON public.buyer_review_queue FOR SELECT USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'moderator'));
DROP POLICY IF EXISTS "queue admin update" ON public.buyer_review_queue;
CREATE POLICY "queue admin update" ON public.buyer_review_queue FOR UPDATE USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'moderator'));

-- Updated get_seller_stats
DROP FUNCTION IF EXISTS public.get_seller_stats(uuid);
CREATE OR REPLACE FUNCTION public.get_seller_stats(_seller_id uuid)
 RETURNS TABLE(completed_sales integer, total_sales integer, avg_rating numeric, avg_shipping_rating numeric,
   avg_communication_rating numeric, avg_accuracy_rating numeric, review_count integer, avg_shipping_days numeric,
   success_rate numeric, late_rate numeric, refund_rate numeric, cancel_rate numeric, on_time_rate numeric,
   avg_response_minutes integer, response_rate numeric)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH paid AS (SELECT * FROM public.orders WHERE seller_id=_seller_id AND payment_status IN ('paid','refunded')),
       shipped AS (SELECT * FROM paid WHERE shipped_at IS NOT NULL AND paid_at IS NOT NULL),
       reviews AS (SELECT id, rating, shipping_rating, communication_rating, accuracy_rating FROM public.seller_reviews WHERE seller_id=_seller_id)
  SELECT (SELECT COUNT(*)::int FROM paid WHERE status IN ('shipped','delivered')),
    (SELECT COUNT(*)::int FROM paid),
    COALESCE((SELECT ROUND(AVG(rating)::numeric,2) FROM reviews), 0),
    COALESCE((SELECT ROUND(AVG(shipping_rating)::numeric,2) FROM reviews), 0),
    COALESCE((SELECT ROUND(AVG(communication_rating)::numeric,2) FROM reviews WHERE communication_rating IS NOT NULL), 0),
    COALESCE((SELECT ROUND(AVG(accuracy_rating)::numeric,2) FROM reviews WHERE accuracy_rating IS NOT NULL), 0),
    (SELECT COUNT(*)::int FROM reviews),
    COALESCE((SELECT ROUND(AVG(EXTRACT(EPOCH FROM (shipped_at-paid_at))/86400)::numeric,2) FROM shipped), 0),
    CASE WHEN (SELECT COUNT(*) FROM paid WHERE status IN ('shipped','delivered','cancelled'))=0 THEN 0
         ELSE ROUND(100.0*(SELECT COUNT(*) FROM paid WHERE status='delivered')/NULLIF((SELECT COUNT(*) FROM paid WHERE status IN ('shipped','delivered','cancelled')),0),1) END,
    CASE WHEN (SELECT COUNT(*) FROM shipped)=0 THEN 0
         ELSE ROUND(100.0*(SELECT COUNT(*) FROM shipped s,paid p WHERE p.id=s.id AND p.shipping_due_at IS NOT NULL AND p.shipped_at>p.shipping_due_at)/(SELECT COUNT(*) FROM shipped),1) END,
    CASE WHEN (SELECT COUNT(*) FROM paid)=0 THEN 0 ELSE ROUND(100.0*(SELECT COUNT(*) FROM paid WHERE refunded_at IS NOT NULL)/(SELECT COUNT(*) FROM paid),1) END,
    CASE WHEN (SELECT COUNT(*) FROM paid)=0 THEN 0 ELSE ROUND(100.0*(SELECT COUNT(*) FROM paid WHERE status='cancelled')/(SELECT COUNT(*) FROM paid),1) END,
    CASE WHEN (SELECT COUNT(*) FROM shipped)=0 THEN 100
         ELSE ROUND(100.0-(100.0*(SELECT COUNT(*) FROM shipped s,paid p WHERE p.id=s.id AND p.shipping_due_at IS NOT NULL AND p.shipped_at>p.shipping_due_at)/(SELECT COUNT(*) FROM shipped)),1) END,
    (SELECT avg_response_minutes FROM public.profiles WHERE id=_seller_id),
    CASE WHEN (SELECT COUNT(*) FROM reviews)=0 THEN 0
         ELSE ROUND(100.0*(SELECT COUNT(*) FROM public.review_responses rr JOIN reviews r ON r.id=rr.review_id WHERE rr.author_role='seller')/(SELECT COUNT(*) FROM reviews),1) END;
$$;

CREATE OR REPLACE FUNCTION public.get_seller_recent_reviews(_seller_id uuid, _limit integer DEFAULT 20)
RETURNS TABLE (id uuid, buyer_id uuid, buyer_username text, rating integer, shipping_rating integer,
  communication_rating integer, accuracy_rating integer, comment text, photo_urls text[], created_at timestamptz,
  verified_purchase boolean, verified_live_auction boolean, seller_response jsonb, buyer_response jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT r.id, r.buyer_id, r.buyer_username, r.rating, r.shipping_rating, r.communication_rating, r.accuracy_rating,
    r.comment, r.photo_urls, r.created_at, r.verified_purchase, r.verified_live_auction,
    (SELECT to_jsonb(rr) FROM public.review_responses rr WHERE rr.review_id=r.id AND rr.author_role='seller' LIMIT 1),
    (SELECT to_jsonb(rr) FROM public.review_responses rr WHERE rr.review_id=r.id AND rr.author_role='buyer' LIMIT 1)
  FROM public.seller_reviews r WHERE r.seller_id=_seller_id ORDER BY r.created_at DESC LIMIT GREATEST(1, LEAST(_limit, 200));
$$;

CREATE OR REPLACE FUNCTION public.get_buyer_reputation(_user_id uuid)
RETURNS TABLE (completed_purchases integer, paid_orders integer, payment_success_rate numeric, avg_payment_minutes numeric,
  cancellation_rate numeric, refund_rate numeric, chargeback_count integer, unpaid_wins integer, unresolved_payments integer,
  account_age_days integer, last_active_at timestamptz, unpaid_strikes integer, bid_restricted_until timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH o AS (SELECT * FROM public.orders WHERE buyer_id=_user_id),
       paid AS (SELECT * FROM o WHERE payment_status IN ('paid','refunded')),
       fast AS (SELECT EXTRACT(EPOCH FROM (paid_at-created_at))/60 AS mins FROM paid WHERE paid_at IS NOT NULL)
  SELECT (SELECT COUNT(*)::int FROM o WHERE status='delivered'),
    (SELECT COUNT(*)::int FROM paid),
    CASE WHEN (SELECT COUNT(*) FROM o WHERE payment_status IN ('paid','failed','refunded'))=0 THEN 0
         ELSE ROUND(100.0*(SELECT COUNT(*) FROM paid)/NULLIF((SELECT COUNT(*) FROM o WHERE payment_status IN ('paid','failed','refunded')),0),1) END,
    COALESCE((SELECT ROUND(AVG(mins)::numeric,1) FROM fast), 0),
    CASE WHEN (SELECT COUNT(*) FROM o)=0 THEN 0 ELSE ROUND(100.0*(SELECT COUNT(*) FROM o WHERE status='cancelled')/(SELECT COUNT(*) FROM o),1) END,
    CASE WHEN (SELECT COUNT(*) FROM paid)=0 THEN 0 ELSE ROUND(100.0*(SELECT COUNT(*) FROM paid WHERE refunded_at IS NOT NULL)/(SELECT COUNT(*) FROM paid),1) END,
    (SELECT COUNT(*)::int FROM public.disputes d WHERE d.reporter_id=_user_id AND d.reason ILIKE '%chargeback%'),
    (SELECT COUNT(*)::int FROM o WHERE payment_status='failed'),
    (SELECT COUNT(*)::int FROM o WHERE payment_status='awaiting_payment' AND created_at < now() - interval '24 hours'),
    GREATEST(0, EXTRACT(DAY FROM (now()-(SELECT created_at FROM public.profiles WHERE id=_user_id)))::int),
    (SELECT MAX(created_at) FROM o),
    COALESCE((SELECT unpaid_strikes FROM public.profiles WHERE id=_user_id), 0),
    (SELECT bid_restricted_until FROM public.profiles WHERE id=_user_id);
$$;

CREATE OR REPLACE FUNCTION public.get_buyer_public_badges(_user_id uuid)
RETURNS TABLE (badge text, label text, tier text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _r record;
BEGIN
  SELECT * INTO _r FROM public.get_buyer_reputation(_user_id);
  IF _r.completed_purchases >= 35 AND _r.payment_success_rate >= 95 THEN badge:='trusted_buyer'; label:='Trusted Buyer'; tier:='gold'; RETURN NEXT; END IF;
  IF _r.avg_payment_minutes IS NOT NULL AND _r.avg_payment_minutes <= 30 AND _r.paid_orders >= 5 THEN badge:='fast_payer'; label:='Fast Payer'; tier:='platinum'; RETURN NEXT; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id=_user_id AND (buyer_verified=true OR phone_verified=true)) THEN badge:='verified_buyer'; label:='Verified Buyer'; tier:='silver'; RETURN NEXT; END IF;
  IF _r.completed_purchases >= 10 THEN badge:='repeat_customer'; label:='Repeat Customer'; tier:='silver'; RETURN NEXT; END IF;
  IF (SELECT COUNT(*) FROM public.live_bids WHERE bidder_id=_user_id) >= 100 THEN badge:='auction_veteran'; label:='Auction Veteran'; tier:='gold'; RETURN NEXT; END IF;
  BEGIN
    IF (SELECT COUNT(*) FROM public.tips WHERE from_user_id=_user_id) >= 5 THEN badge:='supportive_buyer'; label:='Supportive Buyer'; tier:='silver'; RETURN NEXT; END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN;
END $$;

CREATE OR REPLACE FUNCTION public.get_buyer_private_insights(_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _caller uuid := auth.uid(); _r record;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (_caller=_user_id OR public.has_role(_caller,'admin') OR public.has_role(_caller,'owner') OR public.has_role(_caller,'moderator')
     OR EXISTS (SELECT 1 FROM public.orders WHERE seller_id=_caller AND buyer_id=_user_id)) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  SELECT * INTO _r FROM public.get_buyer_reputation(_user_id);
  RETURN to_jsonb(_r);
END $$;

CREATE OR REPLACE FUNCTION public.get_seller_response_badges(_seller_id uuid)
RETURNS TABLE (badge text, label text, tier text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _s record; _recent int;
BEGIN
  SELECT * INTO _s FROM public.get_seller_stats(_seller_id);
  IF _s.avg_response_minutes IS NOT NULL AND _s.avg_response_minutes <= 60 THEN badge:='responds_fast'; label:='Responds Fast'; tier:='gold'; RETURN NEXT; END IF;
  SELECT COUNT(*) INTO _recent FROM public.live_streams WHERE seller_id=_seller_id AND COALESCE(started_at, created_at) > now() - interval '14 days';
  IF _recent >= 3 THEN badge:='active_seller'; label:='Active Seller'; tier:='silver'; RETURN NEXT; END IF;
  IF _s.review_count >= 10 AND _s.avg_rating >= 4.7 THEN badge:='top_rated'; label:='Top Rated'; tier:='platinum'; RETURN NEXT; END IF;
  RETURN;
END $$;

CREATE OR REPLACE FUNCTION public.is_bid_restricted(_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id=_user AND bid_restricted_until IS NOT NULL AND bid_restricted_until > now());
$$;

CREATE OR REPLACE FUNCTION public.record_unpaid_auction_win(_buyer_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _strikes int; _distinct_streams int; _restricted boolean := false;
BEGIN
  IF _buyer_id IS NULL THEN RETURN jsonb_build_object('ok', false); END IF;
  UPDATE public.profiles SET unpaid_strikes=COALESCE(unpaid_strikes,0)+1 WHERE id=_buyer_id RETURNING unpaid_strikes INTO _strikes;
  SELECT COUNT(DISTINCT stream_id) INTO _distinct_streams FROM public.orders WHERE buyer_id=_buyer_id AND payment_status='failed' AND stream_id IS NOT NULL;
  IF _strikes >= 10 AND _distinct_streams >= 10 THEN
    UPDATE public.profiles SET bid_restricted_until = now() + interval '30 days',
      bid_restricted_reason = 'Auto: 10+ unpaid auction wins across 10+ streams'
     WHERE id=_buyer_id AND (bid_restricted_until IS NULL OR bid_restricted_until < now() + interval '30 days');
    INSERT INTO public.buyer_review_queue (buyer_id, reason, unpaid_strikes) VALUES (_buyer_id, 'auto_unpaid_threshold', _strikes);
    INSERT INTO public.notifications (user_id, sender_id, type, body, link)
    VALUES (_buyer_id, _buyer_id, 'account_restricted',
      '⛔ Your account is on hold due to repeated unpaid auction wins. Resolve outstanding orders or contact support.', '/orders');
    _restricted := true;
  END IF;
  RETURN jsonb_build_object('ok', true, 'strikes', _strikes, 'distinct_streams', _distinct_streams, 'restricted', _restricted);
END $$;

CREATE OR REPLACE FUNCTION public.reconcile_stale_payments() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _flagged integer := 0; _r record;
BEGIN
  WITH stale AS (
    UPDATE public.orders SET payment_status='failed'
     WHERE payment_status='awaiting_payment' AND created_at < now() - interval '24 hours' AND paid_at IS NULL
    RETURNING id, buyer_id, title, stream_id)
  SELECT count(*) INTO _flagged FROM stale;
  FOR _r IN
    SELECT id, buyer_id, title, stream_id FROM public.orders
     WHERE payment_status='failed' AND created_at < now() - interval '24 hours' AND paid_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.notifications n WHERE n.user_id=orders.buyer_id AND n.link='/orders' AND n.type='payment_failed' AND n.body LIKE '%' || orders.title || '%')
  LOOP
    INSERT INTO public.notifications (user_id, sender_id, type, body, link)
    VALUES (_r.buyer_id, _r.buyer_id, 'payment_failed',
      '⚠️ Your order "' || _r.title || '" expired due to non-payment. Tap to retry.', '/orders');
    IF _r.stream_id IS NOT NULL THEN PERFORM public.record_unpaid_auction_win(_r.buyer_id); END IF;
  END LOOP;
  RETURN COALESCE(_flagged, 0);
END $$;

-- Patch place_live_bid + place_listing_bid to block restricted buyers
CREATE OR REPLACE FUNCTION public.place_live_bid(_stream_id uuid, _amount numeric)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _uid uuid := auth.uid(); _username text; _s public.live_streams%ROWTYPE; _unpaid int;
  _min_inc numeric; _cur numeric; _remaining_ms bigint; _extended boolean := false; _sd_win boolean := false;
  _new_ends timestamptz; _exts int; _sd_sec int; _sd_max int; _dup_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Invalid bid amount'; END IF;
  IF public.is_bid_restricted(_uid) THEN RAISE EXCEPTION 'Account is currently restricted from bidding. Contact support.'; END IF;
  SELECT id INTO _dup_id FROM public.live_bids WHERE stream_id=_stream_id AND bidder_id=_uid AND amount=_amount AND created_at > now() - interval '2 seconds' ORDER BY created_at DESC LIMIT 1;
  IF _dup_id IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'amount', _amount, 'duplicate', true); END IF;
  SELECT COUNT(*) INTO _unpaid FROM public.orders WHERE buyer_id=_uid AND payment_status='awaiting_payment';
  IF _unpaid > 0 THEN RAISE EXCEPTION 'Pay your pending order before bidding'; END IF;
  SELECT * INTO _s FROM public.live_streams WHERE id=_stream_id FOR UPDATE;
  IF _s.id IS NULL THEN RAISE EXCEPTION 'Stream not found'; END IF;
  IF _s.seller_id=_uid THEN RAISE EXCEPTION 'Sellers cannot bid on their own stream'; END IF;
  IF _s.status<>'live' THEN RAISE EXCEPTION 'Stream is not live'; END IF;
  IF _s.ends_at IS NULL OR _s.ends_at <= now() THEN RAISE EXCEPTION 'Auction not running'; END IF;
  IF public.is_bid_blocked(_stream_id, _uid) THEN RAISE EXCEPTION 'You are blocked from bidding here'; END IF;
  _cur := COALESCE(_s.current_bid, 0); _min_inc := GREATEST(COALESCE(_s.min_bid_increment, 1), 0.01);
  IF _amount < _cur + _min_inc THEN RAISE EXCEPTION 'Bid must be at least $%', (_cur + _min_inc)::text; END IF;
  SELECT username INTO _username FROM public.profiles WHERE id=_uid;
  _remaining_ms := EXTRACT(EPOCH FROM (_s.ends_at - now())) * 1000;
  _exts := COALESCE(_s.snipe_extends, 0);
  _sd_sec := GREATEST(1, COALESCE(_s.sudden_death_seconds_added, 5));
  _sd_max := GREATEST(1, COALESCE(_s.sudden_death_max_triggers, 3));
  IF COALESCE(_s.sudden_death_active, false) THEN
    _new_ends := now() + interval '1200 milliseconds'; _sd_win := true;
    UPDATE public.live_streams SET current_bid=_amount, current_bidder_id=_uid, ends_at=_new_ends, sudden_death_active=false WHERE id=_stream_id;
  ELSIF COALESCE(_s.sudden_death_enabled, false) AND _remaining_ms > 0 AND _remaining_ms <= 3000 THEN
    _new_ends := GREATEST(_s.ends_at, now()) + make_interval(secs => _sd_sec); _extended := true;
    UPDATE public.live_streams SET current_bid=_amount, current_bidder_id=_uid, ends_at=_new_ends,
      snipe_extends=_exts+1, sudden_death_active=((_exts+1) >= _sd_max) WHERE id=_stream_id;
  ELSE
    UPDATE public.live_streams SET current_bid=_amount, current_bidder_id=_uid WHERE id=_stream_id;
  END IF;
  BEGIN
    INSERT INTO public.live_bids (stream_id, bidder_id, bidder_username, amount, round_number, was_anti_snipe, was_sudden_death)
    VALUES (_stream_id, _uid, _username, _amount, _s.round_number, _extended, _sd_win);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', true, 'amount', _amount, 'duplicate', true);
  END;
  INSERT INTO public.audit_logs (actor_id, actor_username, action, target_type, target_id, meta)
  VALUES (_uid, _username, 'live_bid_placed', 'live_stream', _stream_id,
          jsonb_build_object('amount', _amount, 'prev_bid', _cur, 'extended', _extended, 'sudden_death_win', _sd_win));
  RETURN jsonb_build_object('ok', true, 'amount', _amount, 'extended', _extended, 'sudden_death_win', _sd_win);
END;
$function$;

CREATE OR REPLACE FUNCTION public.place_listing_bid(_listing_id uuid, _amount numeric)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _uid uuid := auth.uid(); _username text; _l listings%ROWTYPE; _unpaid int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Invalid bid amount'; END IF;
  IF public.is_bid_restricted(_uid) THEN RAISE EXCEPTION 'Account is currently restricted from bidding. Contact support.'; END IF;
  SELECT COUNT(*) INTO _unpaid FROM public.orders WHERE buyer_id=_uid AND payment_status='awaiting_payment';
  IF _unpaid > 0 THEN RAISE EXCEPTION 'Pay your pending order before bidding'; END IF;
  SELECT * INTO _l FROM public.listings WHERE id=_listing_id FOR UPDATE;
  IF _l.id IS NULL THEN RAISE EXCEPTION 'Listing not found'; END IF;
  IF _l.seller_id=_uid THEN RAISE EXCEPTION 'Sellers cannot bid on their own listing'; END IF;
  IF COALESCE(_l.listing_type, 'buy_now') <> 'auction' AND NOT _l.is_auction THEN RAISE EXCEPTION 'Listing is not an auction'; END IF;
  IF _l.auction_status <> 'active' THEN RAISE EXCEPTION 'Auction is not active'; END IF;
  IF _l.auction_ends_at IS NOT NULL AND _l.auction_ends_at <= now() THEN RAISE EXCEPTION 'Auction ended'; END IF;
  IF _amount <= COALESCE(_l.current_bid, _l.starting_bid, 0) THEN RAISE EXCEPTION 'Bid must be higher than current bid'; END IF;
  SELECT username INTO _username FROM public.profiles WHERE id=_uid;
  INSERT INTO public.listing_bids (listing_id, user_id, username, amount) VALUES (_listing_id, _uid, _username, _amount);
  UPDATE public.listings SET current_bid=_amount, top_bidder_id=_uid WHERE id=_listing_id;
  IF _l.auction_ends_at IS NOT NULL AND _l.auction_ends_at - now() < interval '30 seconds' THEN
    UPDATE public.listings SET auction_ends_at = now() + interval '60 seconds' WHERE id=_listing_id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'amount', _amount);
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_waive_buyer_restriction(_buyer uuid, _notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _c uuid := auth.uid();
BEGIN
  IF NOT (public.has_role(_c,'admin') OR public.has_role(_c,'owner') OR public.has_role(_c,'moderator')) THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  UPDATE public.profiles SET bid_restricted_until=NULL, bid_restricted_reason=NULL, unpaid_strikes=0 WHERE id=_buyer;
  UPDATE public.buyer_review_queue SET status='waived', resolved_by=_c, resolved_at=now(), resolution_notes=_notes WHERE buyer_id=_buyer AND status='pending';
  INSERT INTO public.notifications (user_id, sender_id, type, body, link)
  VALUES (_buyer, _c, 'account_restored', '✅ Your account restriction has been lifted. You can bid again.', '/');
END $$;

CREATE OR REPLACE FUNCTION public.admin_extend_buyer_restriction(_buyer uuid, _days integer, _notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _c uuid := auth.uid();
BEGIN
  IF NOT (public.has_role(_c,'admin') OR public.has_role(_c,'owner') OR public.has_role(_c,'moderator')) THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  UPDATE public.profiles SET bid_restricted_until = GREATEST(COALESCE(bid_restricted_until, now()), now()) + make_interval(days => GREATEST(1,_days)),
    bid_restricted_reason = COALESCE(bid_restricted_reason, 'Extended by admin') WHERE id=_buyer;
  UPDATE public.buyer_review_queue SET status='extended', resolved_by=_c, resolved_at=now(), resolution_notes=_notes WHERE buyer_id=_buyer AND status='pending';
END $$;

CREATE OR REPLACE FUNCTION public.admin_ban_buyer(_buyer uuid, _notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _c uuid := auth.uid();
BEGIN
  IF NOT (public.has_role(_c,'admin') OR public.has_role(_c,'owner')) THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  UPDATE public.profiles SET bid_restricted_until = now() + interval '100 years', bid_restricted_reason='Permanent ban' WHERE id=_buyer;
  BEGIN INSERT INTO public.user_suspensions (user_id, reason, active) VALUES (_buyer, COALESCE(_notes,'Banned by admin'), true);
  EXCEPTION WHEN OTHERS THEN NULL; END;
  UPDATE public.buyer_review_queue SET status='banned', resolved_by=_c, resolved_at=now(), resolution_notes=_notes WHERE buyer_id=_buyer AND status='pending';
END $$;

REVOKE EXECUTE ON FUNCTION public.record_unpaid_auction_win(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_waive_buyer_restriction(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_extend_buyer_restriction(uuid, integer, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_ban_buyer(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_buyer_private_insights(uuid) FROM PUBLIC, anon;

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.review_responses; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.review_reports; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.buyer_review_queue; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
