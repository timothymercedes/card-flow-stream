REVOKE ALL ON FUNCTION public.accept_legal_document(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_legal_document(text, text, text) TO authenticated;