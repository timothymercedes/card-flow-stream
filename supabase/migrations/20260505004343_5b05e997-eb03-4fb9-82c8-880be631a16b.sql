
DROP VIEW IF EXISTS public.public_profiles CASCADE;

DROP POLICY IF EXISTS "Public safe read" ON public.profiles;

CREATE POLICY "Admins read profiles" ON public.profiles
  FOR SELECT USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner')
  );

CREATE OR REPLACE FUNCTION public.public_profile_by_username(_username text)
RETURNS TABLE (
  id uuid, username text, avatar_url text, public_id text,
  is_seller boolean, seller_status text, buyer_verified boolean,
  phone_verified boolean, created_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, username, avatar_url, public_id, is_seller, seller_status,
         buyer_verified, phone_verified, created_at
  FROM public.profiles WHERE username = _username
$$;

CREATE OR REPLACE FUNCTION public.public_profiles_by_ids(_ids uuid[])
RETURNS TABLE (
  id uuid, username text, avatar_url text, public_id text,
  is_seller boolean, seller_status text, buyer_verified boolean,
  phone_verified boolean
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, username, avatar_url, public_id, is_seller, seller_status,
         buyer_verified, phone_verified
  FROM public.profiles WHERE id = ANY(_ids)
$$;

CREATE OR REPLACE FUNCTION public.search_public_profiles(_query text, _limit int DEFAULT 10)
RETURNS TABLE (
  id uuid, username text, avatar_url text, is_seller boolean, seller_status text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, username, avatar_url, is_seller, seller_status
  FROM public.profiles
  WHERE username ILIKE '%' || _query || '%'
  LIMIT GREATEST(1, LEAST(_limit, 25))
$$;

CREATE OR REPLACE FUNCTION public.get_seller_completed_count(_user uuid)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::int FROM public.orders
  WHERE seller_id = _user AND status IN ('shipped', 'delivered')
$$;

CREATE OR REPLACE FUNCTION public.get_buyer_completed_count(_user uuid)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::int FROM public.orders o
  WHERE o.buyer_id = _user
    AND o.status = 'delivered'
    AND NOT EXISTS (
      SELECT 1 FROM public.disputes d
      WHERE d.order_id = o.id AND d.status IN ('open', 'investigating')
    )
$$;

CREATE OR REPLACE FUNCTION public.list_followers(_user uuid)
RETURNS TABLE (id uuid, username text, avatar_url text, seller_status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.username, p.avatar_url, p.seller_status
  FROM public.follows f
  JOIN public.profiles p ON p.id = f.follower_id
  WHERE f.followee_id = _user
  ORDER BY f.created_at DESC
$$;

CREATE OR REPLACE FUNCTION public.list_following(_user uuid)
RETURNS TABLE (id uuid, username text, avatar_url text, seller_status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.username, p.avatar_url, p.seller_status
  FROM public.follows f
  JOIN public.profiles p ON p.id = f.followee_id
  WHERE f.follower_id = _user
  ORDER BY f.created_at DESC
$$;
