-- Replace buyer update policy: prevent buyers from changing payment_status, paid_at, status, or financial fields.
DROP POLICY IF EXISTS "Buyers update own orders" ON public.orders;

CREATE POLICY "Buyers update shipping fields only"
ON public.orders
FOR UPDATE
TO authenticated
USING (auth.uid() = buyer_id)
WITH CHECK (
  auth.uid() = buyer_id
  AND payment_status = (SELECT payment_status FROM public.orders o2 WHERE o2.id = orders.id)
  AND paid_at IS NOT DISTINCT FROM (SELECT paid_at FROM public.orders o2 WHERE o2.id = orders.id)
  AND amount = (SELECT amount FROM public.orders o2 WHERE o2.id = orders.id)
  AND seller_id = (SELECT seller_id FROM public.orders o2 WHERE o2.id = orders.id)
  AND status = (SELECT status FROM public.orders o2 WHERE o2.id = orders.id)
);

-- Allow buyers to delete their own unpaid orders (cart removal)
CREATE POLICY "Buyers delete own unpaid orders"
ON public.orders
FOR DELETE
TO authenticated
USING (auth.uid() = buyer_id AND payment_status = 'awaiting_payment');
