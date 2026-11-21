DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace AND n.nspname='public'
    WHERE p.proname IN ('tutorials_for_route','complete_payout','fail_payout','enforce_late_shipments','lock_order_funds','get_buyer_reputation','buyer_active_restrictions','recalc_seller_trust','run_financial_reconciliation','get_notify_targets','compute_seller_payable','get_winner_shipping')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace AND n.nspname='public'
    WHERE p.proname IN ('admin_revenue_by_period','admin_revenue_by_stream','admin_revenue_by_seller','admin_list_integrity_alerts','record_collection_activity','apply_ai_shipment_scan','register_shipping_scan','mark_order_packed','mark_order_ready')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.record_collection_activity(_user_id uuid)
RETURNS TABLE(current_streak integer, longest_streak integer, gained boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _row public.collection_streaks;
  _today DATE := (now() AT TIME ZONE 'utc')::date;
  _new INT;
  _gained BOOLEAN := false;
BEGIN
  IF auth.role() <> 'service_role' AND (auth.uid() IS NULL OR _user_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  SELECT * INTO _row FROM public.collection_streaks WHERE user_id = _user_id;
  IF NOT FOUND THEN
    INSERT INTO public.collection_streaks(user_id, current_streak, longest_streak, last_activity_date, total_activities)
    VALUES (_user_id, 1, 1, _today, 1)
    RETURNING * INTO _row;
    _gained := true;
  ELSIF _row.last_activity_date IS DISTINCT FROM _today THEN
    IF _row.last_activity_date = _today - 1 THEN
      _new := _row.current_streak + 1;
    ELSE
      _new := 1;
    END IF;
    UPDATE public.collection_streaks
      SET current_streak = _new,
          longest_streak = GREATEST(collection_streaks.longest_streak, _new),
          last_activity_date = _today,
          total_activities = collection_streaks.total_activities + 1
      WHERE user_id = _user_id
      RETURNING * INTO _row;
    _gained := true;
  END IF;
  RETURN QUERY SELECT _row.current_streak, _row.longest_streak, _gained;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.record_collection_activity(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_collection_activity(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Highlight items readable" ON public.story_highlight_items;
CREATE POLICY "Highlight items readable" ON public.story_highlight_items FOR SELECT
USING (EXISTS (SELECT 1 FROM public.stories s WHERE s.id = story_highlight_items.story_id AND s.deleted_at IS NULL
  AND public.can_view_story(s.user_id, s.visibility::text, auth.uid())));

DROP POLICY IF EXISTS "Highlights readable" ON public.story_highlights;
CREATE POLICY "Highlights readable" ON public.story_highlights FOR SELECT
USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.story_highlight_items i JOIN public.stories s ON s.id = i.story_id
  WHERE i.highlight_id = story_highlights.id AND s.deleted_at IS NULL
  AND public.can_view_story(s.user_id, s.visibility::text, auth.uid())));