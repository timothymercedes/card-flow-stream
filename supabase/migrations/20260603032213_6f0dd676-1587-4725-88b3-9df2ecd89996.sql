-- Public catalogs
GRANT SELECT ON public.daily_quests TO anon, authenticated;
GRANT ALL ON public.daily_quests TO service_role;

GRANT SELECT ON public.achievements TO anon, authenticated;
GRANT ALL ON public.achievements TO service_role;

-- User-scoped progression (self read via RLS)
GRANT SELECT ON public.user_progression TO authenticated;
GRANT ALL ON public.user_progression TO service_role;

GRANT SELECT ON public.user_quest_progress TO authenticated;
GRANT ALL ON public.user_quest_progress TO service_role;

GRANT SELECT ON public.xp_events TO authenticated;
GRANT ALL ON public.xp_events TO service_role;

-- Achievement unlocks: public read policy already exists
GRANT SELECT ON public.user_achievements TO anon, authenticated;
GRANT ALL ON public.user_achievements TO service_role;