-- Run against an isolated, data-free copy of the application schema only.
-- Requires seed participants/items in /tmp test setup; every change rolls back.
BEGIN;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
SELECT public.trade_create('10000000-0000-0000-0000-000000000001',ARRAY['20000000-0000-0000-0000-000000000002']::uuid[],ARRAY['20000000-0000-0000-0000-000000000001']::uuid[]) AS trade_id \gset
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
SELECT public.trade_create('10000000-0000-0000-0000-000000000001',ARRAY['20000000-0000-0000-0000-000000000003']::uuid[],ARRAY['20000000-0000-0000-0000-000000000001']::uuid[]) AS competing_id \gset
SELECT public.place_listing_bid('30000000-0000-0000-0000-000000000001',6);
INSERT INTO public.offers(listing_id,buyer_id,buyer_username,seller_id,amount) VALUES
('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','isolated_2','10000000-0000-0000-0000-000000000001',20),
('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','isolated_3','10000000-0000-0000-0000-000000000001',25);
DO $$ BEGIN
 IF (SELECT closed_at IS NOT NULL FROM public.listings WHERE id='30000000-0000-0000-0000-000000000001') THEN RAISE EXCEPTION 'Unaccepted proposal closed listing'; END IF;
 IF EXISTS(SELECT 1 FROM public.trade_card_locks WHERE vault_card_id='20000000-0000-0000-0000-000000000001') THEN RAISE EXCEPTION 'Unaccepted proposal reserved Marketplace item'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
SELECT public.trade_action(:'trade_id','accept');
DO $$ DECLARE l public.listings%ROWTYPE; BEGIN
 SELECT * INTO l FROM public.listings WHERE id='30000000-0000-0000-0000-000000000001';
 IF l.closed_at IS NULL OR l.closed_by<>'trade' OR l.closed_winner_id<>'10000000-0000-0000-0000-000000000002' OR l.auction_status<>'sold_early' THEN RAISE EXCEPTION 'Trade did not close listing safely'; END IF;
 IF EXISTS(SELECT 1 FROM public.offers WHERE listing_id=l.id AND status<>'rejected') THEN RAISE EXCEPTION 'Pending offer not rejected'; END IF;
 IF (SELECT count(*) FROM public.listing_bids WHERE listing_id=l.id)<>1 THEN RAISE EXCEPTION 'Bid history was erased'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.notifications WHERE user_id='10000000-0000-0000-0000-000000000003' AND link='/market/'||l.id::text) THEN RAISE EXCEPTION 'Losing bidder/offer sender not notified'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.trades WHERE from_user='10000000-0000-0000-0000-000000000003' AND status='cancelled') THEN RAISE EXCEPTION 'Competing trade not cancelled'; END IF;
 IF EXISTS(SELECT 1 FROM public.trade_card_locks WHERE vault_card_id='20000000-0000-0000-0000-000000000003') THEN RAISE EXCEPTION 'Competing proposal lock not released'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
DO $$ BEGIN
 BEGIN PERFORM public.place_listing_bid('30000000-0000-0000-0000-000000000001',7); RAISE EXCEPTION 'STALE BID ACCEPTED'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT IN ('Auction is not active','This listing has already sold') THEN RAISE; END IF; END;
 BEGIN INSERT INTO public.offers(listing_id,buyer_id,buyer_username,seller_id,amount) VALUES('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','isolated_3','10000000-0000-0000-0000-000000000001',30); RAISE EXCEPTION 'STALE OFFER ACCEPTED'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'This listing has already sold' THEN RAISE; END IF; END;
END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
DO $$ BEGIN
 BEGIN INSERT INTO public.orders(listing_id,buyer_id,seller_id,title,amount) VALUES('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Isolated test',50); RAISE EXCEPTION 'TRADE WINNER CASH ORDER ACCEPTED'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'This listing has already sold' THEN RAISE; END IF; END;
END $$;
SELECT public.trade_action(:'trade_id','ship','USPS','ISOLATED-BUYER-TRACKING');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
SELECT public.trade_action(:'trade_id','ship','UPS','ISOLATED-SELLER-TRACKING');
SELECT public.trade_action(:'trade_id','receive');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
SELECT public.trade_action(:'trade_id','receive');
SELECT public.trade_action(:'trade_id','receive');
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.trades WHERE from_user='10000000-0000-0000-0000-000000000002' AND status='completed' AND from_received_at IS NOT NULL AND to_received_at IS NOT NULL) THEN RAISE EXCEPTION 'Two-sided completion failed'; END IF;
 IF EXISTS(SELECT 1 FROM public.trade_card_locks WHERE vault_card_id IN ('20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002')) THEN RAISE EXCEPTION 'Completed trade left card locks'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.listings WHERE id='30000000-0000-0000-0000-000000000001' AND closed_by='trade' AND auction_status='sold_early') THEN RAISE EXCEPTION 'Completion reopened listing'; END IF;
 RAISE NOTICE 'PASS: proposals stay open, trade acceptance closes auction, rejects offers, notifies bidder, cancels rivals, blocks stale actions; two receipts complete without reopening';
END $$;
ROLLBACK;
