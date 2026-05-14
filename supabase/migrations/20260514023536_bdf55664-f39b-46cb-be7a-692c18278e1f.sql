
REVOKE EXECUTE ON FUNCTION public.get_notify_targets(uuid[], text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_user(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_user(uuid, text, text, text, text) TO service_role;
