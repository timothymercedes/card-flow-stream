GRANT SELECT,INSERT,UPDATE,DELETE ON public.posts,public.post_comments,public.post_reactions,public.vault_cards TO authenticated;
GRANT ALL ON public.posts,public.post_comments,public.post_reactions,public.vault_cards TO service_role;
GRANT SELECT ON public.posts,public.post_comments,public.post_reactions,public.vault_cards TO anon;
GRANT EXECUTE ON FUNCTION public.personal_profile_by_username(text) TO anon,authenticated,service_role;
COMMENT ON COLUMN public.vault_cards.visibility IS 'DRAFT ONLY proposal: new cards inherit collection privacy; explicit private/only_me never auto-converted.';