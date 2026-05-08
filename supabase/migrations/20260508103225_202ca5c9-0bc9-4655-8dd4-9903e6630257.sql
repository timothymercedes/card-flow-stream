
-- Multi-field user search (username, shop_name, full_name)
CREATE OR REPLACE FUNCTION public.search_users(_query text, _limit int DEFAULT 20)
RETURNS TABLE(
  id uuid, username text, avatar_url text, shop_name text, full_name text,
  is_seller boolean, seller_status text, live_verified boolean,
  follower_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.username, p.avatar_url, p.shop_name, p.full_name,
         p.is_seller, p.seller_status, p.live_verified,
         COALESCE((SELECT count(*) FROM public.follows f WHERE f.followee_id = p.id), 0)
  FROM public.profiles p
  WHERE _query IS NULL OR length(btrim(_query)) = 0 OR (
    p.username ILIKE '%' || _query || '%'
    OR p.shop_name ILIKE '%' || _query || '%'
    OR p.full_name ILIKE '%' || _query || '%'
  )
  ORDER BY
    CASE WHEN p.username ILIKE _query || '%' THEN 0
         WHEN p.shop_name ILIKE _query || '%' THEN 1
         ELSE 2 END,
    p.username
  LIMIT GREATEST(1, LEAST(_limit, 50))
$$;

-- Trending sellers: most followers + recent paid order activity
CREATE OR REPLACE FUNCTION public.trending_sellers(_limit int DEFAULT 12)
RETURNS TABLE(
  id uuid, username text, avatar_url text, shop_name text,
  seller_status text, live_verified boolean,
  follower_count bigint, recent_sales bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.username, p.avatar_url, p.shop_name, p.seller_status, p.live_verified,
    COALESCE((SELECT count(*) FROM public.follows f WHERE f.followee_id = p.id), 0) AS follower_count,
    COALESCE((SELECT count(*) FROM public.orders o
      WHERE o.seller_id = p.id AND o.payment_status='paid'
        AND o.created_at > now() - interval '30 days'), 0) AS recent_sales
  FROM public.profiles p
  WHERE p.seller_status = 'approved'
  ORDER BY recent_sales DESC, follower_count DESC, p.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 50))
$$;

-- Suggested users: friends-of-friends (people followed by people you follow)
CREATE OR REPLACE FUNCTION public.suggested_users(_limit int DEFAULT 12)
RETURNS TABLE(
  id uuid, username text, avatar_url text, shop_name text,
  seller_status text, live_verified boolean, mutual_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH me AS (SELECT auth.uid() AS uid),
  my_follows AS (
    SELECT followee_id FROM public.follows, me WHERE follower_id = me.uid
  ),
  candidates AS (
    SELECT f.followee_id AS suggested_id, count(*) AS mutual_count
    FROM public.follows f
    WHERE f.follower_id IN (SELECT followee_id FROM my_follows)
      AND f.followee_id <> (SELECT uid FROM me)
      AND f.followee_id NOT IN (SELECT followee_id FROM my_follows)
    GROUP BY f.followee_id
  )
  SELECT p.id, p.username, p.avatar_url, p.shop_name, p.seller_status, p.live_verified,
         c.mutual_count
  FROM candidates c
  JOIN public.profiles p ON p.id = c.suggested_id
  ORDER BY c.mutual_count DESC, p.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 50))
$$;
