CREATE OR REPLACE FUNCTION public.trade_staff_action(p_trade uuid, p_action text, p_issue uuid DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t record; uid uuid := auth.uid();
BEGIN
  IF NOT (public.has_role(uid,'owner') OR public.has_role(uid,'admin')) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO t FROM trades WHERE id = p_trade FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trade not found'; END IF;
  IF p_action = 'resolve_issue' THEN
    UPDATE trade_issues SET resolved_at = now(), resolved_by = uid, resolution_note = left(trim(coalesce(p_note,'')),1000)
      WHERE id = p_issue AND trade_id = p_trade AND resolved_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Issue not open'; END IF;
  ELSIF p_action = 'cancel' THEN
    IF t.status IN ('completed','cancelled','countered') THEN RAISE EXCEPTION 'Trade already closed'; END IF;
    UPDATE trades SET status = 'cancelled' WHERE id = p_trade;
    DELETE FROM trade_card_locks WHERE trade_id = p_trade;
  ELSE RAISE EXCEPTION 'Unknown action'; END IF;
  INSERT INTO admin_action_log (admin_id, action, target_table, target_id, before_state, reason)
    VALUES (uid, 'trade_' || p_action, 'trades', p_trade, jsonb_build_object('status', t.status, 'issue', p_issue), left(p_note,1000));
  RETURN (SELECT status FROM trades WHERE id = p_trade);
END $$;