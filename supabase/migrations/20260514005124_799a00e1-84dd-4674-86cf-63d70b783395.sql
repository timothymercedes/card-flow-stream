REVOKE EXECUTE ON FUNCTION public.is_in_quiet_hours(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_in_quiet_hours(uuid) TO authenticated, service_role;