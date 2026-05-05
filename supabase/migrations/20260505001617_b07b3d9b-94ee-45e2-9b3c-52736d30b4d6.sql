-- Allow admins/owner to view all orders for moderation
CREATE POLICY "Admins view all orders"
ON public.orders FOR SELECT TO public
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));