GRANT SELECT ON public.card_price_history TO authenticated;
GRANT ALL ON public.card_price_history TO service_role;
GRANT SELECT ON public.card_price_cache TO authenticated;
GRANT ALL ON public.card_price_cache TO service_role;