CREATE TABLE public.store_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL,
  code text NOT NULL CHECK (code ~ '^[A-Z0-9]{3,20}$'),
  kind text NOT NULL CHECK (kind IN ('percent','amount')),
  value numeric(10,2) NOT NULL CHECK (value > 0),
  min_subtotal numeric(10,2) NOT NULL DEFAULT 0 CHECK (min_subtotal >= 0),
  max_uses integer CHECK (max_uses IS NULL OR max_uses > 0),
  uses integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_coupons_percent_max CHECK (kind <> 'percent' OR value <= 90),
  UNIQUE (seller_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_coupons TO authenticated;
GRANT ALL ON public.store_coupons TO service_role;
ALTER TABLE public.store_coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sellers manage own coupons" ON public.store_coupons FOR ALL TO authenticated
  USING (seller_id = auth.uid()) WITH CHECK (seller_id = auth.uid() AND uses = 0);

CREATE TABLE public.coupon_redemptions (
  order_id uuid PRIMARY KEY,
  coupon_id uuid NOT NULL REFERENCES public.store_coupons(id) ON DELETE RESTRICT,
  buyer_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  code text NOT NULL,
  original_amount numeric(10,2) NOT NULL,
  discount_amount numeric(10,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.coupon_redemptions TO authenticated;
GRANT ALL ON public.coupon_redemptions TO service_role;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Buyer or seller read redemptions" ON public.coupon_redemptions FOR SELECT TO authenticated
  USING (buyer_id = auth.uid() OR seller_id = auth.uid());

CREATE OR REPLACE FUNCTION public.redeem_store_coupon(_order_ids uuid[], _code text)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _seller uuid;
  _c public.store_coupons%ROWTYPE;
  _o record;
  _items numeric := 0;
  _total_discount numeric := 0;
  _left numeric;
  _d numeric;
  _item numeric;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Sign in to use a coupon'; END IF;
  IF _order_ids IS NULL OR array_length(_order_ids,1) IS NULL OR array_length(_order_ids,1) > 50 THEN RAISE EXCEPTION 'No orders'; END IF;
  -- Lock the buyer's orders; all must be unpaid, theirs, from one seller, without a coupon.
  FOR _o IN SELECT id, buyer_id, seller_id, payment_status, amount, coalesce(shipping_amount,0) AS ship FROM public.orders WHERE id = ANY(_order_ids) FOR UPDATE LOOP
    IF _o.buyer_id <> _uid THEN RAISE EXCEPTION 'Order does not belong to you'; END IF;
    IF _o.payment_status <> 'awaiting_payment' THEN RAISE EXCEPTION 'Order is already paid'; END IF;
    IF _seller IS NULL THEN _seller := _o.seller_id; ELSIF _seller <> _o.seller_id THEN RAISE EXCEPTION 'Coupons apply to one store at a time'; END IF;
    IF EXISTS (SELECT 1 FROM public.coupon_redemptions r WHERE r.order_id = _o.id) THEN RAISE EXCEPTION 'A coupon is already applied'; END IF;
    _items := _items + greatest(0, _o.amount - _o.ship);
  END LOOP;
  IF _seller IS NULL OR (SELECT count(*) FROM public.orders WHERE id = ANY(_order_ids)) <> array_length(_order_ids,1) THEN RAISE EXCEPTION 'Order not found'; END IF;

  SELECT * INTO _c FROM public.store_coupons WHERE seller_id = _seller AND code = upper(trim(_code)) FOR UPDATE;
  IF NOT FOUND OR NOT _c.active THEN RAISE EXCEPTION 'That code is not valid for this store'; END IF;
  IF _c.expires_at IS NOT NULL AND _c.expires_at < now() THEN RAISE EXCEPTION 'That code has expired'; END IF;
  IF _c.max_uses IS NOT NULL AND _c.uses >= _c.max_uses THEN RAISE EXCEPTION 'That code has been fully used'; END IF;
  IF _items < _c.min_subtotal THEN RAISE EXCEPTION 'Spend at least $% to use this code', _c.min_subtotal; END IF;

  -- Discount items only, never shipping; keep at least $0.50 of item price per order.
  _left := CASE WHEN _c.kind = 'percent' THEN round(_items * _c.value / 100, 2) ELSE _c.value END;
  FOR _o IN SELECT id, amount, coalesce(shipping_amount,0) AS ship FROM public.orders WHERE id = ANY(_order_ids) ORDER BY id LOOP
    _item := greatest(0, _o.amount - _o.ship);
    _d := least(_left, greatest(0, _item - 0.50));
    IF _c.kind = 'percent' THEN _d := least(_d, round(_item * _c.value / 100, 2)); END IF;
    IF _d > 0 THEN
      UPDATE public.orders SET amount = amount - _d WHERE id = _o.id;
      _left := _left - _d; _total_discount := _total_discount + _d;
    END IF;
    INSERT INTO public.coupon_redemptions(order_id, coupon_id, buyer_id, seller_id, code, original_amount, discount_amount)
      VALUES (_o.id, _c.id, _uid, _seller, _c.code, _o.amount, _d);
  END LOOP;
  IF _total_discount <= 0 THEN RAISE EXCEPTION 'This code does not lower the price of these items'; END IF;
  UPDATE public.store_coupons SET uses = uses + 1 WHERE id = _c.id;
  RETURN _total_discount;
END $$;
REVOKE ALL ON FUNCTION public.redeem_store_coupon(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_store_coupon(uuid[], text) TO authenticated;