DROP FUNCTION public.redeem_store_coupon(uuid[], text);
CREATE OR REPLACE FUNCTION public.redeem_store_coupon(_buyer uuid, _order_ids uuid[], _code text)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := _buyer;
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
REVOKE ALL ON FUNCTION public.redeem_store_coupon(uuid, uuid[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_store_coupon(uuid, uuid[], text) TO service_role;