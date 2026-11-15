CREATE TABLE public.bazaar_supplier_credentials (
  supplier_id               uuid PRIMARY KEY REFERENCES public.bazaar_suppliers(id) ON DELETE CASCADE,
  access_token_ciphertext   text,
  refresh_token_ciphertext  text,
  key_version               smallint    NOT NULL DEFAULT 1,
  access_expires_at         timestamptz,
  refresh_expires_at        timestamptz,
  refresh_lock_owner        uuid,
  refresh_lock_until        timestamptz,
  last_login_at             timestamptz,
  last_refresh_at           timestamptz,
  last_error                text,
  version                   bigint      NOT NULL DEFAULT 0,
  updated_at                timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.bazaar_supplier_credentials FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bazaar_supplier_credentials TO service_role;
ALTER TABLE public.bazaar_supplier_credentials ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER bazaar_supplier_credentials_touch
  BEFORE UPDATE ON public.bazaar_supplier_credentials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE FUNCTION public.bazaar_claim_credential_refresh(_supplier uuid, _owner uuid, _ttl_seconds int DEFAULT 30)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE _ok boolean;
BEGIN
  IF _ttl_seconds < 5 OR _ttl_seconds > 120 THEN RAISE EXCEPTION 'invalid lease ttl'; END IF;
  INSERT INTO public.bazaar_supplier_credentials (supplier_id) VALUES (_supplier) ON CONFLICT (supplier_id) DO NOTHING;
  UPDATE public.bazaar_supplier_credentials
     SET refresh_lock_owner = _owner, refresh_lock_until = now() + make_interval(secs => _ttl_seconds)
   WHERE supplier_id = _supplier
     AND (refresh_lock_until IS NULL OR refresh_lock_until < now() OR refresh_lock_owner = _owner)
  RETURNING true INTO _ok;
  RETURN COALESCE(_ok, false);
END $$;

CREATE FUNCTION public.bazaar_store_credential_tokens(
  _supplier uuid, _owner uuid, _access text, _refresh text,
  _access_exp timestamptz, _refresh_exp timestamptz, _via text, _key_version smallint DEFAULT 1)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE _ok boolean;
BEGIN
  UPDATE public.bazaar_supplier_credentials
     SET access_token_ciphertext = _access, refresh_token_ciphertext = _refresh,
         access_expires_at = _access_exp, refresh_expires_at = _refresh_exp, key_version = _key_version,
         last_login_at = CASE WHEN _via = 'login' THEN now() ELSE last_login_at END,
         last_refresh_at = CASE WHEN _via = 'refresh' THEN now() ELSE last_refresh_at END,
         last_error = NULL, version = version + 1,
         refresh_lock_owner = NULL, refresh_lock_until = NULL
   WHERE supplier_id = _supplier AND refresh_lock_owner = _owner AND refresh_lock_until > now()
  RETURNING true INTO _ok;
  RETURN COALESCE(_ok, false);
END $$;

REVOKE ALL ON FUNCTION public.bazaar_claim_credential_refresh(uuid, uuid, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bazaar_store_credential_tokens(uuid, uuid, text, text, timestamptz, timestamptz, text, smallint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bazaar_claim_credential_refresh(uuid, uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.bazaar_store_credential_tokens(uuid, uuid, text, text, timestamptz, timestamptz, text, smallint) TO service_role;