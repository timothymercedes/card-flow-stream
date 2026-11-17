CREATE FUNCTION public.trade_create(p_to uuid,p_from_cards uuid[],p_to_cards uuid[],p_cash numeric DEFAULT 0,p_direction text DEFAULT 'none',p_message text DEFAULT NULL,p_parent uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
IF EXISTS(SELECT 1 FROM listings WHERE vault_card_id=item.cid AND listing_type IS DISTINCT FROM 'trade' AND auction_status='active') THEN RAISE EXCEPTION 'Card already listed for sale'; END IF;
INSERT INTO trade_card_locks VALUES(item.cid,tid,c.user_id);
INSERT INTO trade_items(trade_id,owner_side,owner_id,vault_card_id,card_name,card_image_url,card_value) VALUES(tid,item.side,c.user_id,item.cid,c.name,c.image_url,coalesce(c.market_price,c.estimated_value,0));
END LOOP; RETURN tid;
END $$;
REVOKE ALL ON FUNCTION public.trade_create(uuid,uuid[],uuid[],numeric,text,text,uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.trade_create(uuid,uuid[],uuid[],numeric,text,text,uuid) TO authenticated;
CREATE FUNCTION public.trade_action(p_trade uuid,p_action text,p_carrier text DEFAULT NULL,p_tracking text DEFAULT NULL,p_body text DEFAULT NULL,p_issue uuid DEFAULT NULL) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t record; uid uuid:=auth.uid(); mine text; other text; required_from boolean; required_to boolean; done boolean; u uuid;
BEGIN
SELECT * INTO t FROM trades WHERE id=p_trade FOR UPDATE;
IF NOT FOUND OR uid IS NULL OR uid NOT IN(t.from_user,t.to_user) THEN RAISE EXCEPTION 'Trade not found or not allowed'; END IF;
mine:=CASE WHEN uid=t.from_user THEN 'from' ELSE 'to' END; other:=CASE WHEN mine='from' THEN 'to' ELSE 'from' END;
IF p_action='accept' THEN
IF uid<>t.to_user OR t.status<>'pending' THEN RAISE EXCEPTION 'Only recipient can accept a pending offer'; END IF;
UPDATE trades SET status='accepted' WHERE id=p_trade;
ELSIF p_action='cancel' THEN
IF t.status NOT IN('pending','accepted') OR t.from_shipped_at IS NOT NULL OR t.to_shipped_at IS NOT NULL OR EXISTS(SELECT 1 FROM trade_issues WHERE trade_id=p_trade AND resolved_at IS NULL) THEN RAISE EXCEPTION 'Cannot cancel a shipped or disputed trade'; END IF;
UPDATE trades SET status='cancelled' WHERE id=p_trade; DELETE FROM trade_card_locks WHERE trade_id=p_trade;
ELSIF p_action IN('ship','receive','issue','resolve_issue') THEN
IF t.status NOT IN('accepted','shipped','delivered') THEN
IF p_action='receive' AND t.status='completed' THEN RETURN t.status; END IF;
RAISE EXCEPTION 'Trade is not active'; END IF;
IF p_action='ship' THEN
IF NOT EXISTS(SELECT 1 FROM trade_items WHERE trade_id=p_trade AND owner_side=mine) THEN RAISE EXCEPTION 'You have no cards to ship'; END IF;
IF length(trim(coalesce(p_carrier,''))) NOT BETWEEN 2 AND 80 OR length(trim(coalesce(p_tracking,''))) NOT BETWEEN 3 AND 120 THEN RAISE EXCEPTION 'Carrier and tracking number required'; END IF;
IF mine='from' THEN UPDATE trades SET from_carrier=trim(p_carrier),from_tracking=trim(p_tracking),from_shipped_at=coalesce(from_shipped_at,now()) WHERE id=p_trade AND to_received_at IS NULL; ELSE UPDATE trades SET to_carrier=trim(p_carrier),to_tracking=trim(p_tracking),to_shipped_at=coalesce(to_shipped_at,now()) WHERE id=p_trade AND from_received_at IS NULL; END IF;
IF NOT FOUND THEN RAISE EXCEPTION 'Shipment already received'; END IF;
ELSIF p_action='receive' THEN
IF NOT EXISTS(SELECT 1 FROM trade_items WHERE trade_id=p_trade AND owner_side=other) OR (mine='from' AND t.to_shipped_at IS NULL) OR (mine='to' AND t.from_shipped_at IS NULL) THEN RAISE EXCEPTION 'Opposite shipment must be sent before receipt'; END IF;
IF mine='from' THEN UPDATE trades SET from_received_at=coalesce(from_received_at,now()) WHERE id=p_trade; ELSE UPDATE trades SET to_received_at=coalesce(to_received_at,now()) WHERE id=p_trade; END IF;
ELSIF p_action='issue' THEN
INSERT INTO trade_issues(trade_id,reporter_id,body) VALUES(p_trade,uid,trim(p_body));
ELSE
UPDATE trade_issues SET resolved_at=coalesce(resolved_at,now()) WHERE id=p_issue AND trade_id=p_trade AND reporter_id=uid;
IF NOT FOUND THEN RAISE EXCEPTION 'Only reporter can resolve their issue'; END IF;
END IF;
SELECT * INTO t FROM trades WHERE id=p_trade;
SELECT EXISTS(SELECT 1 FROM trade_items WHERE trade_id=p_trade AND owner_side='from'),EXISTS(SELECT 1 FROM trade_items WHERE trade_id=p_trade AND owner_side='to') INTO required_from,required_to;
done:=(NOT required_from OR t.to_received_at IS NOT NULL) AND (NOT required_to OR t.from_received_at IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM trade_issues WHERE trade_id=p_trade AND resolved_at IS NULL);
IF done AND (required_from OR required_to) THEN
UPDATE trades SET status='completed',completed_at=now() WHERE id=p_trade;
DELETE FROM trade_card_locks WHERE trade_id=p_trade;
FOREACH u IN ARRAY ARRAY[t.from_user,t.to_user] LOOP
PERFORM grant_user_xp(u,75,'trade:completed',p_trade::text); PERFORM unlock_achievement(u,'first_trade');
IF (SELECT count(*) FROM trades WHERE status='completed' AND u IN(from_user,to_user))>=25 THEN PERFORM unlock_achievement(u,'trade_master'); END IF;
END LOOP;
ELSIF (NOT required_from OR t.from_shipped_at IS NOT NULL) AND (NOT required_to OR t.to_shipped_at IS NOT NULL) AND (required_from OR required_to) THEN UPDATE trades SET status='shipped' WHERE id=p_trade;
END IF;
ELSE RAISE EXCEPTION 'Unknown trade action'; END IF;
RETURN (SELECT status FROM trades WHERE id=p_trade);
END $$;
REVOKE ALL ON FUNCTION public.trade_action(uuid,text,text,text,text,uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.trade_action(uuid,text,text,text,text,uuid) TO authenticated;
COMMENT ON FUNCTION public.trade_action(uuid,text,text,text,text,uuid) IS 'Participant-derived atomic actions retire unilateral advance. Cash-only completion remains unavailable; no payment behavior changes.';