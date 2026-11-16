CREATE OR REPLACE FUNCTION public.notify_saved_search_matches()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s record;
BEGIN
  FOR s IN SELECT * FROM public.saved_searches
    WHERE alerts_enabled AND user_id <> NEW.seller_id
      AND (query = '' OR NEW.title ILIKE '%' || query || '%')
      AND (max_price IS NULL OR COALESCE(NEW.price, NEW.starting_bid, 0) <= max_price)
      AND (last_alerted_at IS NULL OR last_alerted_at < now() - interval '10 minutes')
    LIMIT 200
  LOOP
    PERFORM public.notify_user(_user_id => s.user_id, _type => 'saved_search', _category => 'marketplace',
      _body => 'New match for "' || COALESCE(NULLIF(s.query,''),'your search') || '": ' || left(NEW.title, 80),
      _link => '/market/' || NEW.id);
    UPDATE public.saved_searches SET last_alerted_at = now() WHERE id = s.id;
  END LOOP;
  RETURN NEW;
EXCEPTION WHEN others THEN RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.notify_saved_search_matches() FROM PUBLIC, anon, authenticated;