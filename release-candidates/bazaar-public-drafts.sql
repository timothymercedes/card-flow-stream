-- Show genuine supplier drafts publicly as "Checking availability" (view-only).
-- Purchase rules unchanged: checkout still requires published + approved + verified + $2 profit.
CREATE POLICY "Public sees genuine supplier drafts" ON public.bazaar_products FOR SELECT TO anon, authenticated
  USING (status = 'draft' AND public.bazaar_store_is_active(store_id) AND EXISTS (
    SELECT 1 FROM public.bazaar_supplier_product_links l JOIN public.bazaar_suppliers s ON s.id = l.supplier_id
    WHERE l.product_id = bazaar_products.id AND s.is_demo IS FALSE));
-- Availability projection: drafts join, every draft option reports 'unverified' (not buyable, quantity 0).
-- Full function body replaces the current one with: p.status IN ('published','draft') and
--   WHEN p.status = 'draft' THEN 'unverified' as the first reason case.
-- Rollback: DROP POLICY "Public sees genuine supplier drafts" ON public.bazaar_products; restore prior function body.
