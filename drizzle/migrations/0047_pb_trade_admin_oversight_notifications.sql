ALTER TABLE public.trade_issues ADD COLUMN resolved_by uuid, ADD COLUMN resolution_note text CHECK (resolution_note IS NULL OR length(resolution_note) <= 1000);

CREATE POLICY trades_staff_read ON public.trades FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY trade_items_staff_read ON public.trade_items FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY trade_issues_staff_read ON public.trade_issues FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));

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
  INSERT INTO admin_action_log (admin_id, action, target_type, target_id, details)
    VALUES (uid, 'trade_' || p_action, 'trade', p_trade::text, jsonb_build_object('issue', p_issue));
  RETURN (SELECT status FROM trades WHERE id = p_trade);
EXCEPTION WHEN undefined_column OR undefined_table THEN
  RETURN (SELECT status FROM trades WHERE id = p_trade);
END $$;
REVOKE ALL ON FUNCTION public.trade_staff_action(uuid,text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trade_staff_action(uuid,text,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.trade_notify_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE msg text; who uuid;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    msg := CASE NEW.status WHEN 'accepted' THEN 'Your trade was accepted — time to ship!' WHEN 'shipped' THEN 'Both sides of your trade have shipped.'
      WHEN 'completed' THEN 'Trade complete! Both sides confirmed receipt.' WHEN 'cancelled' THEN 'A trade was cancelled and your cards were unlocked.' ELSE NULL END;
    IF msg IS NOT NULL THEN
      FOREACH who IN ARRAY ARRAY[NEW.from_user, NEW.to_user] LOOP
        PERFORM public.notify_user(_user_id => who, _type => 'trade_' || NEW.status, _category => 'trades', _body => msg, _link => '/trades');
      END LOOP;
    END IF;
  END IF;
  IF NEW.from_shipped_at IS NOT NULL AND OLD.from_shipped_at IS NULL THEN
    PERFORM public.notify_user(_user_id => NEW.to_user, _type => 'trade_shipped', _category => 'trades', _body => 'Your trade partner shipped their cards. Tracking is on your trade.', _link => '/trades');
  END IF;
  IF NEW.to_shipped_at IS NOT NULL AND OLD.to_shipped_at IS NULL THEN
    PERFORM public.notify_user(_user_id => NEW.from_user, _type => 'trade_shipped', _category => 'trades', _body => 'Your trade partner shipped their cards. Tracking is on your trade.', _link => '/trades');
  END IF;
  IF NEW.from_received_at IS NOT NULL AND OLD.from_received_at IS NULL THEN
    PERFORM public.notify_user(_user_id => NEW.to_user, _type => 'trade_received', _category => 'trades', _body => 'Your trade partner confirmed they received your cards.', _link => '/trades');
  END IF;
  IF NEW.to_received_at IS NOT NULL AND OLD.to_received_at IS NULL THEN
    PERFORM public.notify_user(_user_id => NEW.from_user, _type => 'trade_received', _category => 'trades', _body => 'Your trade partner confirmed they received your cards.', _link => '/trades');
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW; -- notifications never block a trade change
END $$;
REVOKE ALL ON FUNCTION public.trade_notify_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trade_notify_change AFTER UPDATE ON public.trades FOR EACH ROW EXECUTE FUNCTION public.trade_notify_change();

CREATE OR REPLACE FUNCTION public.trade_issue_notify() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t record; who uuid;
BEGIN
  SELECT from_user, to_user INTO t FROM trades WHERE id = NEW.trade_id;
  IF TG_OP = 'INSERT' THEN
    FOREACH who IN ARRAY ARRAY[t.from_user, t.to_user] LOOP
      PERFORM public.notify_user(_user_id => who, _type => 'trade_issue', _category => 'trades', _body => 'An issue was reported on your trade. It stays open until resolved.', _link => '/trades');
    END LOOP;
    FOR who IN SELECT user_id FROM user_roles WHERE role IN ('owner','admin') LOOP
      PERFORM public.notify_user(_user_id => who, _type => 'trade_issue', _category => 'admin', _body => 'A PB Trade issue needs review.', _link => '/admin/trades');
    END LOOP;
  ELSIF NEW.resolved_at IS NOT NULL AND OLD.resolved_at IS NULL THEN
    FOREACH who IN ARRAY ARRAY[t.from_user, t.to_user] LOOP
      PERFORM public.notify_user(_user_id => who, _type => 'trade_issue_resolved', _category => 'trades', _body => 'An issue on your trade was resolved.', _link => '/trades');
    END LOOP;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.trade_issue_notify() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trade_issue_notify AFTER INSERT OR UPDATE ON public.trade_issues FOR EACH ROW EXECUTE FUNCTION public.trade_issue_notify();