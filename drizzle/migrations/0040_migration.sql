ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_reasons text[] NOT NULL DEFAULT '{}', ADD COLUMN IF NOT EXISTS collector_goals text[] NOT NULL DEFAULT '{}';

CREATE TABLE public.saved_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  query text NOT NULL DEFAULT '',
  department text NOT NULL DEFAULT 'all',
  max_price numeric,
  alerts_enabled boolean NOT NULL DEFAULT true,
  last_alerted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_searches TO authenticated;
GRANT ALL ON public.saved_searches TO service_role;
ALTER TABLE public.saved_searches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own saved searches read" ON public.saved_searches FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own saved searches insert" ON public.saved_searches FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND length(query) <= 120);
CREATE POLICY "Own saved searches update" ON public.saved_searches FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own saved searches delete" ON public.saved_searches FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX saved_searches_user_idx ON public.saved_searches(user_id);

CREATE OR REPLACE FUNCTION public.notify_saved_search_matches()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; n int := 0;
BEGIN
  IF NEW.status IS DISTINCT FROM 'active' THEN RETURN NEW; END IF;
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
    n := n + 1;
  END LOOP;
  RETURN NEW;
EXCEPTION WHEN others THEN RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.notify_saved_search_matches() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER listings_saved_search_alerts AFTER INSERT ON public.listings FOR EACH ROW EXECUTE FUNCTION public.notify_saved_search_matches();