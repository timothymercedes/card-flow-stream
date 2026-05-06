REVOKE EXECUTE ON FUNCTION public.apply_live_stream_safety(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_live_stream_safety(uuid) TO authenticated;