
-- 1. stream_tips: restrict SELECT to participants + admins/owners
DROP POLICY IF EXISTS "Tips viewable by signed-in users" ON public.stream_tips;
CREATE POLICY "Tips viewable by participants and admins"
  ON public.stream_tips
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = buyer_id
    OR auth.uid() = seller_id
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'owner')
  );

-- 2. stream_payment_events: require buyer's INSERT to match a real order
DROP POLICY IF EXISTS "Buyer logs own payment event" ON public.stream_payment_events;
CREATE POLICY "Buyer logs own payment event"
  ON public.stream_payment_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = buyer_id
    AND order_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = stream_payment_events.order_id
        AND o.buyer_id = auth.uid()
        AND o.seller_id = stream_payment_events.seller_id
    )
  );

-- 3. receipts: require sellers to reference a real order
DROP POLICY IF EXISTS "Sellers create receipts" ON public.receipts;
CREATE POLICY "Sellers create receipts"
  ON public.receipts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = seller_id
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.seller_id = auth.uid()
        AND o.buyer_id = receipts.buyer_id
    )
  );

-- 4. live_streams: ensure bidder UPDATE policy is column-limited at policy level too.
--    Existing trigger live_streams_restrict_bidder_update already enforces this; tighten
--    the WITH CHECK to require bidder identity matches caller.
DROP POLICY IF EXISTS "Bidders update bid fields" ON public.live_streams;
CREATE POLICY "Bidders update bid fields"
  ON public.live_streams
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND auth.uid() <> seller_id
    AND status = 'live'
    AND is_active = true
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() <> seller_id
    AND current_bidder_id = auth.uid()
  );

-- 5. orders: add WITH CHECK on seller UPDATE so financial fields cannot be mutated.
--    A trigger (orders_restrict_client_update) already guards columns; mirror at policy level.
DROP POLICY IF EXISTS "Sellers update orders" ON public.orders;
CREATE POLICY "Sellers update orders"
  ON public.orders
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = seller_id)
  WITH CHECK (
    auth.uid() = seller_id
    -- seller cannot reassign the order
    AND seller_id = (SELECT o.seller_id FROM public.orders o WHERE o.id = orders.id)
    AND buyer_id = (SELECT o.buyer_id FROM public.orders o WHERE o.id = orders.id)
    AND amount = (SELECT o.amount FROM public.orders o WHERE o.id = orders.id)
    AND COALESCE(commission_rate, -1) = COALESCE((SELECT o.commission_rate FROM public.orders o WHERE o.id = orders.id), -1)
    AND COALESCE(commission_amount, -1) = COALESCE((SELECT o.commission_amount FROM public.orders o WHERE o.id = orders.id), -1)
    AND COALESCE(seller_payout_amount, -1) = COALESCE((SELECT o.seller_payout_amount FROM public.orders o WHERE o.id = orders.id), -1)
    AND COALESCE(refunded_amount, -1) = COALESCE((SELECT o.refunded_amount FROM public.orders o WHERE o.id = orders.id), -1)
    AND COALESCE(stripe_charge_id, '') = COALESCE((SELECT o.stripe_charge_id FROM public.orders o WHERE o.id = orders.id), '')
    AND COALESCE(payment_status, '') = COALESCE((SELECT o.payment_status FROM public.orders o WHERE o.id = orders.id), '')
  );

-- 6. spin_wheels: tighten viewer UPDATE WITH CHECK to require seller_id unchanged.
DROP POLICY IF EXISTS "Viewer triggers allowed spin" ON public.spin_wheels;
CREATE POLICY "Viewer triggers allowed spin"
  ON public.spin_wheels
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND viewer_can_spin = true
    AND is_open = true
    AND is_spinning = false
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND viewer_can_spin = true
    AND is_open = true
    AND seller_id = (SELECT sw.seller_id FROM public.spin_wheels sw WHERE sw.id = spin_wheels.id)
  );
