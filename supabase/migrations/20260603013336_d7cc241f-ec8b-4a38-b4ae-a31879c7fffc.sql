REVOKE EXECUTE ON FUNCTION public.grant_user_xp(uuid, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_user_xp(uuid, integer, text, text) TO service_role;