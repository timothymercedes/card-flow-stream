DROP POLICY "Sellers manage own coupons" ON public.store_coupons;
CREATE POLICY "Sellers manage own coupons" ON public.store_coupons FOR ALL TO authenticated
  USING (seller_id = auth.uid()) WITH CHECK (seller_id = auth.uid());