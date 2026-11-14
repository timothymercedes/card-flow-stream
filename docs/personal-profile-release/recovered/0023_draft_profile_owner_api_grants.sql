GRANT SELECT,INSERT,UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.vault_settings TO authenticated;
GRANT ALL ON public.vault_settings TO service_role;
COMMENT ON FUNCTION public.personal_profile_by_username(text) IS 'DRAFT ONLY, separate approval before production: safe five-column social identity with two-way block enforcement.';