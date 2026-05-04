REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;

CREATE OR REPLACE FUNCTION public.accept_legal_document(_document_type text, _version text DEFAULT '1.0', _user_agent text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to accept legal documents';
  END IF;

  INSERT INTO public.legal_acceptances (user_id, document_type, version, user_agent)
  VALUES (auth.uid(), _document_type, COALESCE(_version, '1.0'), LEFT(_user_agent, 200))
  ON CONFLICT (user_id, document_type, version) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_legal_document(text, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.accept_legal_document(text, text, text) FROM anon;