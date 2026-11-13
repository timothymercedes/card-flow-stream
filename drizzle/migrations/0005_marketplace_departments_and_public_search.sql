ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS department text, ADD COLUMN IF NOT EXISTS product_details jsonb NOT NULL DEFAULT '{}'::jsonb, ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public';
ALTER TABLE public.listings ADD CONSTRAINT listings_product_details_object CHECK (jsonb_typeof(product_details) = 'object');
ALTER TABLE public.listings ADD CONSTRAINT listings_visibility_valid CHECK (visibility IN ('public','private','draft'));
CREATE INDEX IF NOT EXISTS listings_department_idx ON public.listings(department);
DROP POLICY IF EXISTS "Listings viewable by all" ON public.listings;
CREATE POLICY "Published listings and owner reads" ON public.listings FOR SELECT USING (seller_id=auth.uid() OR (visibility='public' AND expires_at>now() AND auction_status NOT IN ('draft','private','cancelled')));
CREATE OR REPLACE FUNCTION public.search_marketplace(_query text DEFAULT '', _department text DEFAULT 'all', _filters jsonb DEFAULT '{}'::jsonb, _page integer DEFAULT 1, _limit integer DEFAULT 40) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
WITH catalog AS (
 SELECT l.*, COALESCE(l.department, 'collectibles') AS dept, p.username AS storefront_username,p.shop_name AS storefront_name,
 CASE WHEN l.is_auction THEN COALESCE(l.current_bid,l.starting_bid,0) ELSE COALESCE(l.price,l.buy_now_price,0) END AS display_price
 FROM public.listings l LEFT JOIN public.profiles p ON p.id=l.seller_id
 WHERE l.visibility='public' AND l.expires_at>now() AND l.auction_status NOT IN ('draft','private','cancelled')
 AND (l.is_auction OR COALESCE(l.price,l.buy_now_price,0)>0 OR l.accepts_offers OR l.listing_type IN ('offer','trade'))
), matched AS (
 SELECT * FROM catalog l WHERE (_department='all' OR l.dept=_department)
 AND (trim(_query)='' OR lower(concat_ws(' ',title,description,category,dept,replace(dept,'_',' '),tcg_set,tcg_number,product_details::text,storefront_username,storefront_name, CASE dept WHEN 'collectibles' THEN 'Trading Cards Collectibles Pokémon Pokemon' WHEN 'tools' THEN 'Tools Equipment Power tools' WHEN 'home' THEN 'Home Furniture' WHEN 'sports_outdoors' THEN 'Sports Outdoors' WHEN 'business' THEN 'Business Industrial' WHEN 'music' THEN 'Music Entertainment' ELSE dept END)) LIKE '%'||lower(left(_query,200))||'%')
 AND NOT EXISTS (SELECT 1 FROM jsonb_each_text(_filters) f WHERE f.value<>'' AND CASE
 WHEN f.key='category' THEN l.category IS DISTINCT FROM f.value
 WHEN f.key='condition' THEN COALESCE(l.product_details->>'condition',l.condition::text,'')<>f.value
 WHEN f.key='set' THEN COALESCE(l.tcg_set,'') NOT ILIKE '%'||f.value||'%'
 WHEN f.key='number' THEN COALESCE(l.tcg_number,'') NOT ILIKE '%'||f.value||'%'
 WHEN f.key='min_price' THEN CASE WHEN f.value ~ '^\d+(\.\d+)?$' THEN display_price<f.value::numeric ELSE true END
 WHEN f.key='max_price' THEN CASE WHEN f.value ~ '^\d+(\.\d+)?$' THEN display_price>f.value::numeric ELSE true END
 WHEN f.key='max_mileage' THEN CASE WHEN f.value ~ '^\d+$' AND COALESCE(l.product_details->>'mileage','') ~ '^\d+$' THEN (l.product_details->>'mileage')::numeric>f.value::numeric ELSE true END
 WHEN f.key='kind' THEN CASE f.value WHEN 'auction' THEN NOT l.is_auction WHEN 'buy_now' THEN l.is_auction OR display_price<=0 WHEN 'make_offer' THEN NOT (l.accepts_offers OR l.listing_type='offer') WHEN 'ending_soon' THEN l.auction_ends_at IS NULL OR l.auction_ends_at<=now() OR l.auction_ends_at>now()+interval '24 hours' WHEN 'trending' THEN NOT(l.is_auction AND COALESCE(l.current_bid,0)>COALESCE(l.starting_bid,0)) ELSE false END
 WHEN f.key='sort' THEN false
 ELSE COALESCE(l.product_details->>f.key,'') NOT ILIKE '%'||f.value||'%' END)
), page AS (
 SELECT jsonb_build_object('id',id,'title',title,'description',description,'image_url',image_url,'back_image_url',back_image_url,'seller_id',seller_id,'category',category,'department',dept,'product_details',product_details,'condition',condition,'tcg_set',tcg_set,'tcg_number',tcg_number,'price',price,'buy_now_price',buy_now_price,'current_bid',current_bid,'starting_bid',starting_bid,'is_auction',is_auction,'listing_type',listing_type,'accepts_offers',accepts_offers,'quantity',quantity,'sold_count',sold_count,'expires_at',expires_at,'auction_ends_at',auction_ends_at,'created_at',created_at,'storefront_name',storefront_name,'storefront_username',storefront_username) AS item
 FROM matched ORDER BY CASE WHEN _filters->>'sort'='price_asc' THEN display_price END ASC, CASE WHEN _filters->>'sort'='price_desc' THEN display_price END DESC, CASE WHEN _filters->>'sort'='ending_soon' THEN auction_ends_at END ASC NULLS LAST,created_at DESC,id
 LIMIT greatest(1,least(_limit,60)) OFFSET (greatest(1,least(_page,10000))-1)*greatest(1,least(_limit,60))
) SELECT jsonb_build_object('items',COALESCE((SELECT jsonb_agg(item) FROM page),'[]'::jsonb),'total',(SELECT count(*) FROM matched));
$$;
REVOKE ALL ON FUNCTION public.search_marketplace(text,text,jsonb,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_marketplace(text,text,jsonb,integer,integer) TO anon,authenticated,service_role;