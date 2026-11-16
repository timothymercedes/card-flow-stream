CREATE OR REPLACE FUNCTION public.list_followers(_user uuid)
 RETURNS TABLE(id uuid, username text, avatar_url text, seller_status text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT p.id, p.username, p.avatar_url, p.seller_status
  FROM public.follows f
  JOIN public.profiles p ON p.id = f.follower_id
  WHERE f.followee_id = _user
    AND (auth.uid() = _user OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')
         OR COALESCE((SELECT show_followers_list FROM public.profiles WHERE id = _user), true))
  ORDER BY f.created_at DESC
$function$;
CREATE OR REPLACE FUNCTION public.list_following(_user uuid)
 RETURNS TABLE(id uuid, username text, avatar_url text, seller_status text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT p.id, p.username, p.avatar_url, p.seller_status
  FROM public.follows f
  JOIN public.profiles p ON p.id = f.followee_id
  WHERE f.follower_id = _user
    AND (auth.uid() = _user OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')
         OR COALESCE((SELECT show_following_list FROM public.profiles WHERE id = _user), true))
  ORDER BY f.created_at DESC
$function$;