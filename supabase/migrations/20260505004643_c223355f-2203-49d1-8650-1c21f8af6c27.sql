
CREATE OR REPLACE FUNCTION public.get_seller_shipping_cap(_user uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT shipping_cap FROM public.profiles WHERE id = _user
$$;
