ALTER POLICY "user achievements signed-in read" ON public.user_achievements TO authenticated USING (auth.uid() = user_id);
ALTER POLICY "Members viewable by signed-in" ON public.community_members TO authenticated USING (auth.uid() = user_id);
ALTER POLICY "Contributions viewable by signed-in" ON public.community_challenge_contributions TO authenticated USING (auth.uid() = user_id);