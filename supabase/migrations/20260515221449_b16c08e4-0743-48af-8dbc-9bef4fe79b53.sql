ALTER PUBLICATION supabase_realtime ADD TABLE public.stories;
ALTER PUBLICATION supabase_realtime ADD TABLE public.story_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.story_views;
ALTER TABLE public.stories REPLICA IDENTITY FULL;
ALTER TABLE public.story_reactions REPLICA IDENTITY FULL;
ALTER TABLE public.story_views REPLICA IDENTITY FULL;