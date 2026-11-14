DROP POLICY IF EXISTS "Mods viewable by signed-in" ON public.stream_moderators;
CREATE POLICY "Hosts and mods view stream mods" ON public.stream_moderators FOR SELECT TO authenticated
USING (auth.uid() = host_id OR auth.uid() = mod_user_id);

CREATE OR REPLACE FUNCTION public.list_stream_moderators(_stream_id uuid)
RETURNS TABLE(mod_user_id uuid, mod_username text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.mod_user_id, m.mod_username FROM public.stream_moderators m WHERE m.stream_id = _stream_id
$$;
REVOKE ALL ON FUNCTION public.list_stream_moderators(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.list_stream_moderators(uuid) TO authenticated;

DROP POLICY IF EXISTS "Entries viewable by signed-in" ON public.giveaway_entries;
CREATE POLICY "Entrant or host views entries" ON public.giveaway_entries FOR SELECT TO authenticated
USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.giveaways g WHERE g.id = giveaway_entries.giveaway_id AND g.seller_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.giveaway_entry_count(_giveaway_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM public.giveaway_entries WHERE giveaway_id = _giveaway_id
$$;
REVOKE ALL ON FUNCTION public.giveaway_entry_count(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.giveaway_entry_count(uuid) TO authenticated;

DROP POLICY IF EXISTS "Wheels viewable by signed-in" ON public.spin_wheels;
CREATE POLICY "Host or live viewers view wheel" ON public.spin_wheels FOR SELECT TO authenticated
USING (auth.uid() = seller_id OR EXISTS (SELECT 1 FROM public.live_streams ls WHERE ls.id = spin_wheels.stream_id AND ls.status = 'live'));

DROP POLICY IF EXISTS "Spins viewable by signed-in" ON public.wheel_spins;
CREATE POLICY "Host or participants view spins" ON public.wheel_spins FOR SELECT TO authenticated
USING (auth.uid() = triggered_by_id OR auth.uid() = winner_id OR EXISTS (SELECT 1 FROM public.spin_wheels w WHERE w.id = wheel_spins.wheel_id AND w.seller_id = auth.uid()));