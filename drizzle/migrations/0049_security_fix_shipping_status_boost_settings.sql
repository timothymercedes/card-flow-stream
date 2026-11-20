REVOKE EXECUTE ON FUNCTION public.set_order_shipping_status(uuid,shipping_status,text,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_order_shipping_status(uuid,shipping_status,text,text,text,text,jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.bump_quest_progress(text,integer) FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS "boost settings readable" ON public.listing_boost_settings;
CREATE POLICY "signed-in users read boost settings" ON public.listing_boost_settings FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
REVOKE SELECT ON public.listing_boost_settings FROM anon;