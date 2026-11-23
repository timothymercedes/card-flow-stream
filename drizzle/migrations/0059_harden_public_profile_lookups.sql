CREATE OR REPLACE FUNCTION public.search_users(_query text, _limit integer DEFAULT 25)
RETURNS TABLE(id uuid, username text, avatar_url text, shop_name text, full_name text, is_seller boolean, seller_status text, live_verified boolean, follower_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH q AS (SELECT replace(replace(replace(btrim(coalesce(_query,'')), '\', '\\'), '%', '\%'), '_', '\_') AS v)
  SELECT p.id, p.username, p.avatar_url, p.shop_name, NULL::text,
         p.is_seller, p.seller_status, p.live_verified,
         COALESCE((SELECT count(*) FROM public.follows f WHERE f.followee_id = p.id), 0)
  FROM public.profiles p, q
  WHERE length(q.v) >= 2
    AND (p.username ILIKE '%' || q.v || '%' OR p.shop_name ILIKE '%' || q.v || '%')
  ORDER BY
    CASE WHEN p.username ILIKE q.v || '%' THEN 0
         WHEN p.shop_name ILIKE q.v || '%' THEN 1
         ELSE 2 END,
    p.username
  LIMIT GREATEST(1, LEAST(coalesce(_limit, 25), 25))
$fn$;

CREATE OR REPLACE FUNCTION public.public_profile_by_username(_username text)
RETURNS TABLE(id uuid, username text, avatar_url text, public_id text, is_seller boolean, seller_status text, buyer_verified boolean, phone_verified boolean, created_at timestamptz, shop_name text, bio text, banner_url text, accent_color text, social_links jsonb, featured_listing_ids uuid[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT id, username, avatar_url, public_id, is_seller, seller_status,
         buyer_verified, NULL::boolean, created_at,
         shop_name, bio, banner_url, accent_color, social_links, featured_listing_ids
  FROM public.profiles
  WHERE length(btrim(coalesce(_username,''))) > 0 AND lower(username) = lower(btrim(_username))
  LIMIT 1
$fn$;