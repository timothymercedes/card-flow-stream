
DROP FUNCTION IF EXISTS public.public_profile_by_username(text);

CREATE FUNCTION public.public_profile_by_username(_username text)
RETURNS TABLE(
  id uuid,
  username text,
  avatar_url text,
  public_id text,
  is_seller boolean,
  seller_status text,
  buyer_verified boolean,
  phone_verified boolean,
  created_at timestamp with time zone,
  shop_name text,
  bio text,
  banner_url text,
  accent_color text,
  social_links jsonb,
  featured_listing_ids uuid[]
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT id, username, avatar_url, public_id, is_seller, seller_status,
         buyer_verified, phone_verified, created_at,
         shop_name, bio, banner_url, accent_color, social_links, featured_listing_ids
  FROM public.profiles WHERE lower(username) = lower(_username)
$function$;

GRANT EXECUTE ON FUNCTION public.public_profile_by_username(text) TO anon, authenticated;
