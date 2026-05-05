GRANT EXECUTE ON FUNCTION public.can_view_vault_owner(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_vault(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_story(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_stream_staff(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_suspended(uuid) TO authenticated;