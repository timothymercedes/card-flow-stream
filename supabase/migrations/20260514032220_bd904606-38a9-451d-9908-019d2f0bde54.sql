
CREATE OR REPLACE FUNCTION public.seller_country(_seller_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(address_country, 'US') FROM public.profiles WHERE id = _seller_id
$$;

REVOKE EXECUTE ON FUNCTION public.seller_country(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.seller_country(uuid) TO authenticated;
