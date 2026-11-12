DROP POLICY IF EXISTS "cwheel spins public read" ON public.collection_wheel_spins;
DROP POLICY IF EXISTS "user achievements public read" ON public.user_achievements;
CREATE POLICY "user achievements signed-in read" ON public.user_achievements FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "queue viewable by anyone" ON public.auction_queue;
CREATE POLICY "queue viewable by signed-in or host" ON public.auction_queue FOR SELECT TO authenticated
  USING (host_id = auth.uid() OR winner_id = auth.uid() OR sold_to = auth.uid() OR (auth.uid() IS NOT NULL AND status IN ('queued','running','sold','finished','ended','completed')));

DROP POLICY IF EXISTS "Mods viewable by all" ON public.stream_moderators;
CREATE POLICY "Mods viewable by signed-in" ON public.stream_moderators FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Edit history viewable by all" ON public.post_edits;
CREATE POLICY "Edit history viewable by editor or post owner" ON public.post_edits FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_edits.post_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "Members are viewable by everyone" ON public.community_members;
CREATE POLICY "Members viewable by signed-in" ON public.community_members FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Entries viewable by all" ON public.giveaway_entries;
CREATE POLICY "Entries viewable by signed-in" ON public.giveaway_entries FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Bans viewable by all" ON public.stream_user_bans;
CREATE POLICY "Bans viewable by involved users" ON public.stream_user_bans FOR SELECT TO authenticated
  USING (banned_user_id = auth.uid() OR banned_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.stream_moderators m WHERE m.stream_id = stream_user_bans.stream_id AND (m.host_id = auth.uid() OR m.mod_user_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM public.live_streams s WHERE s.id = stream_user_bans.stream_id AND s.seller_id = auth.uid()));

DROP POLICY IF EXISTS "Contributions are viewable by everyone" ON public.community_challenge_contributions;
CREATE POLICY "Contributions viewable by signed-in" ON public.community_challenge_contributions FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Wheels viewable by all" ON public.spin_wheels;
CREATE POLICY "Wheels viewable by signed-in" ON public.spin_wheels FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Spins viewable by all" ON public.wheel_spins;
CREATE POLICY "Spins viewable by signed-in" ON public.wheel_spins FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Stories storage respects visibility" ON storage.objects;
CREATE POLICY "Stories storage respects visibility" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'stories' AND auth.uid() IS NOT NULL AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (SELECT 1 FROM public.stories s WHERE s.image_url LIKE '%' || objects.name || '%' AND s.expires_at > now() AND public.can_view_story(s.user_id, s.visibility, auth.uid()))));