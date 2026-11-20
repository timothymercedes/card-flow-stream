-- Approval: owner-authorized correction after isolated tests, Nov 20 2026.
CREATE OR REPLACE FUNCTION public.trade_create(p_to uuid, p_from_cards uuid[], p_to_cards uuid[], p_cash numeric DEFAULT 0, p_direction text DEFAULT 'none'::text, p_message text DEFAULT NULL::text, p_parent uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE uid uuid:=auth.uid(); tid uuid; c record; item record; parent record;
BEGIN
IF uid IS NULL OR p_to=uid OR p_to IS NULL THEN RAISE EXCEPTION 'Invalid trade participants'; END IF;
IF p_cash IS NULL OR p_cash<0 OR p_cash>1000000 OR p_direction IS NULL OR p_direction NOT IN('none','from_pays','to_pays') OR length(coalesce(p_message,''))>1000 OR cardinality(p_from_cards)>50 OR cardinality(p_to_cards)>50 THEN RAISE EXCEPTION 'Invalid trade offer'; END IF;
IF coalesce(cardinality(p_from_cards),0)+coalesce(cardinality(p_to_cards),0)=0 AND p_cash=0 THEN RAISE EXCEPTION 'A trade needs cards or cash'; END IF;
IF p_parent IS NOT NULL THEN SELECT * INTO parent FROM trades WHERE id=p_parent FOR UPDATE; IF NOT FOUND OR parent.to_user<>uid OR parent.from_user<>p_to OR parent.status<>'pending' THEN RAISE EXCEPTION 'Cannot counter this trade'; END IF; UPDATE trades SET status='countered' WHERE id=p_parent; DELETE FROM trade_card_locks WHERE trade_id=p_parent; END IF;
IF (SELECT count(*) FROM trades WHERE from_user=uid AND to_user=p_to AND status IN('pending','countered'))>=10 THEN RAISE EXCEPTION 'Too many open trades with this user'; END IF;
PERFORM 1 FROM vault_cards WHERE id=ANY(coalesce(p_from_cards,'{}')||coalesce(p_to_cards,'{}')) ORDER BY id FOR UPDATE;
INSERT INTO trades(from_user,to_user,cash_amount,cash_direction,message,parent_trade_id) VALUES(uid,p_to,p_cash,p_direction,p_message,p_parent) RETURNING id INTO tid;
FOR item IN SELECT x AS cid,'from' AS side FROM unnest(coalesce(p_from_cards,'{}'::uuid[])) x UNION ALL SELECT x AS cid,'to' AS side FROM unnest(coalesce(p_to_cards,'{}'::uuid[])) x LOOP
SELECT * INTO c FROM vault_cards WHERE id=item.cid;
IF NOT FOUND THEN RAISE EXCEPTION 'Card not found'; END IF;
IF (item.side='from' AND c.user_id<>uid) OR (item.side='to' AND c.user_id<>p_to) OR c.is_sold OR c.status<>'available' OR c.collection_only OR (item.side='to' AND NOT(c.accept_trades OR c.trade_plus_cash)) THEN RAISE EXCEPTION 'Card unavailable for this trade'; END IF;
IF EXISTS(SELECT 1 FROM trade_card_locks WHERE vault_card_id=item.cid) THEN RAISE EXCEPTION 'Card locked in another trade'; END IF;
IF EXISTS(SELECT 1 FROM listings WHERE vault_card_id=item.cid AND (closed_at IS NOT NULL OR sold_count>=quantity)) THEN RAISE EXCEPTION 'Listing has already sold'; END IF;
IF EXISTS(SELECT 1 FROM listings WHERE vault_card_id=item.cid AND auction_status='active' AND (channel<>'marketplace' OR NOT accepts_trades)) THEN RAISE EXCEPTION 'Card already listed for sale'; END IF;
-- A public mixed-option listing is reserved only at acceptance, not by an unsolicited proposal.
IF NOT EXISTS(SELECT 1 FROM listings WHERE vault_card_id=item.cid AND channel='marketplace' AND accepts_trades AND closed_at IS NULL) THEN
INSERT INTO trade_card_locks VALUES(item.cid,tid,c.user_id);
END IF;
INSERT INTO trade_items(trade_id,owner_side,owner_id,vault_card_id,card_name,card_image_url,card_value) VALUES(tid,item.side,c.user_id,item.cid,c.name,c.image_url,coalesce(c.market_price,c.estimated_value,0));
END LOOP; RETURN tid;
END $$;

CREATE OR REPLACE FUNCTION public.trade_protect_listing() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ BEGIN
IF NEW.vault_card_id IS NOT NULL THEN
PERFORM 1 FROM vault_cards WHERE id=NEW.vault_card_id FOR UPDATE;
IF EXISTS(SELECT 1 FROM trade_card_locks WHERE vault_card_id=NEW.vault_card_id) THEN
-- Only the nested trade-acceptance trigger can close an already-listed locked item.
IF TG_OP='UPDATE' AND pg_trigger_depth()>1 AND OLD.closed_at IS NULL AND NEW.closed_at IS NOT NULL AND NEW.closed_by='trade'
 AND (to_jsonb(NEW)-ARRAY['closed_at','closed_by','closed_winner_id','auction_status'])=(to_jsonb(OLD)-ARRAY['closed_at','closed_by','closed_winner_id','auction_status']) THEN RETURN NEW; END IF;
RAISE EXCEPTION 'Locked in trade: cannot list card'; END IF; END IF; RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION public.listing_close_followups() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE r record;
BEGIN
  IF NEW.closed_at IS NOT NULL AND OLD.closed_at IS NULL THEN
    BEGIN
      FOR r IN
        SELECT DISTINCT uid FROM (
          SELECT b.user_id AS uid FROM public.listing_bids b WHERE b.listing_id = NEW.id
          UNION SELECT o.buyer_id FROM public.offers o WHERE o.listing_id = NEW.id AND o.status = 'pending'
        ) s WHERE uid IS NOT NULL AND uid IS DISTINCT FROM NEW.closed_winner_id
      LOOP
        PERFORM public.notify_user(_user_id => r.uid, _type => 'listing', _category => 'marketplace',
          _body => format('"%s" is no longer available — it sold another way.', NEW.title),
          _link => '/market/' || NEW.id::text);
      END LOOP;
    EXCEPTION WHEN OTHERS THEN NULL; -- alerts must never undo a completed sale
    END;
    UPDATE public.offers SET status = 'rejected'
     WHERE listing_id = NEW.id AND status = 'pending';
    FOR r IN SELECT DISTINCT t.id FROM public.trades t JOIN public.trade_items i ON i.trade_id=t.id
      WHERE i.vault_card_id=NEW.vault_card_id AND t.status='pending' ORDER BY t.id
    LOOP
      UPDATE public.trades SET status='cancelled' WHERE id=r.id AND status='pending';
      DELETE FROM public.trade_card_locks WHERE trade_id=r.id;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.listing_guard_order() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE _l public.listings%ROWTYPE;
BEGIN
  IF NEW.listing_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO _l FROM public.listings WHERE id = NEW.listing_id FOR UPDATE;
  IF _l.id IS NULL OR _l.channel <> 'marketplace' THEN RETURN NEW; END IF;
  IF _l.closed_at IS NOT NULL AND (_l.closed_by='trade' OR NEW.buyer_id IS DISTINCT FROM _l.closed_winner_id) THEN
    RAISE EXCEPTION 'This listing has already sold';
  END IF;
  IF _l.closed_at IS NULL AND _l.is_auction AND EXISTS (SELECT 1 FROM public.listing_bids WHERE listing_id = _l.id) THEN
    RAISE EXCEPTION 'Buy Now ended once bidding started';
  END IF;
  RETURN NEW;
END $$;

-- The old lock trigger closed listings while the proposal was still pending.
DROP TRIGGER IF EXISTS trg_trade_lock_closes_listing ON public.trade_card_locks;
CREATE OR REPLACE FUNCTION public.trade_listing_accept_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE i record; c public.vault_cards%ROWTYPE; l public.listings%ROWTYPE;
BEGIN
  IF NEW.status<>'accepted' OR OLD.status<>'pending' THEN RETURN NEW; END IF;
  PERFORM 1 FROM public.vault_cards WHERE id IN (SELECT vault_card_id FROM public.trade_items WHERE trade_id=NEW.id) ORDER BY id FOR UPDATE;
  FOR i IN SELECT * FROM public.trade_items WHERE trade_id=NEW.id ORDER BY vault_card_id LOOP
    SELECT * INTO c FROM public.vault_cards WHERE id=i.vault_card_id;
    IF c.id IS NULL OR c.user_id IS DISTINCT FROM i.owner_id OR c.is_sold OR c.status<>'available' OR c.collection_only THEN RAISE EXCEPTION 'Trade item is no longer available'; END IF;
    IF EXISTS(SELECT 1 FROM public.trade_card_locks WHERE vault_card_id=c.id AND trade_id<>NEW.id) THEN RAISE EXCEPTION 'Card locked in another trade'; END IF;
    FOR l IN SELECT * FROM public.listings WHERE vault_card_id=c.id ORDER BY id FOR UPDATE LOOP
      IF l.channel<>'marketplace' OR NOT l.accepts_trades OR l.closed_at IS NOT NULL OR l.sold_count>=l.quantity THEN RAISE EXCEPTION 'Listing is no longer available for trade'; END IF;
    END LOOP;
    INSERT INTO public.trade_card_locks(vault_card_id,trade_id,owner_id) VALUES(c.id,NEW.id,c.user_id) ON CONFLICT(vault_card_id) DO NOTHING;
  END LOOP;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.trade_listing_close_accepted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  IF NEW.status='accepted' AND OLD.status='pending' THEN
    UPDATE public.listings l SET closed_at=now(),closed_by='trade',
      closed_winner_id=CASE WHEN l.seller_id=NEW.from_user THEN NEW.to_user ELSE NEW.from_user END,
      auction_status=CASE WHEN l.is_auction AND l.auction_status='active' THEN 'sold_early' ELSE l.auction_status END
      WHERE l.channel='marketplace' AND l.closed_at IS NULL AND l.vault_card_id IN (SELECT vault_card_id FROM public.trade_items WHERE trade_id=NEW.id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_trade_listing_accept_guard BEFORE UPDATE OF status ON public.trades FOR EACH ROW EXECUTE FUNCTION public.trade_listing_accept_guard();
CREATE TRIGGER trg_trade_listing_close_accepted AFTER UPDATE OF status ON public.trades FOR EACH ROW EXECUTE FUNCTION public.trade_listing_close_accepted();
REVOKE ALL ON FUNCTION public.trade_listing_accept_guard(),public.trade_listing_close_accepted() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.trade_create(uuid,uuid[],uuid[],numeric,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.trade_create(uuid,uuid[],uuid[],numeric,text,text,uuid) TO authenticated;
