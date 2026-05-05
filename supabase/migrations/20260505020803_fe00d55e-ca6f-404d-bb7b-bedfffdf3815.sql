ALTER TABLE public.live_streams
  ADD COLUMN IF NOT EXISTS break_slot_price numeric NOT NULL DEFAULT 10;

ALTER TABLE public.break_slots
  ADD COLUMN IF NOT EXISTS order_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'break_slots_order_id_fkey'
  ) THEN
    ALTER TABLE public.break_slots
      ADD CONSTRAINT break_slots_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_break_slots_order_id ON public.break_slots(order_id);
CREATE INDEX IF NOT EXISTS idx_break_slots_stream_buyer ON public.break_slots(stream_id, buyer_id);

DROP POLICY IF EXISTS "Buyers claim break slot" ON public.break_slots;
CREATE POLICY "Buyers claim break slot with paid order"
ON public.break_slots
FOR INSERT
WITH CHECK (
  auth.uid() = buyer_id
  AND order_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = break_slots.order_id
      AND o.buyer_id = auth.uid()
      AND o.stream_id = break_slots.stream_id
      AND o.payment_status = 'paid'
  )
);

CREATE OR REPLACE FUNCTION public.claim_break_slots(_stream_id uuid, _slot_numbers integer[])
RETURNS TABLE(order_id uuid, claimed_count integer, total_amount numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _buyer uuid := auth.uid();
  _seller uuid;
  _stream_title text;
  _slot_count integer;
  _price numeric;
  _prefix text;
  _characters jsonb;
  _item_image text;
  _username text;
  _full_name text;
  _address text;
  _city text;
  _state text;
  _zip text;
  _country text;
  _nums integer[];
  _labels text[];
  _order_id uuid;
BEGIN
  IF _buyer IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to claim a character';
  END IF;

  SELECT ls.seller_id,
         ls.title,
         ls.break_slot_count,
         COALESCE(ls.break_slot_price, 10),
         ls.break_slot_prefix,
         ls.break_characters,
         COALESCE(ls.item_image_url, ls.thumbnail_url)
    INTO _seller, _stream_title, _slot_count, _price, _prefix, _characters, _item_image
  FROM public.live_streams ls
  WHERE ls.id = _stream_id
    AND ls.break_mode = 'open'
  FOR UPDATE;

  IF _seller IS NULL THEN
    RAISE EXCEPTION 'This break is not open';
  END IF;

  IF _seller = _buyer THEN
    RAISE EXCEPTION 'Host cannot claim their own break slots';
  END IF;

  SELECT array_agg(DISTINCT n ORDER BY n)
    INTO _nums
  FROM unnest(COALESCE(_slot_numbers, ARRAY[]::integer[])) AS n
  WHERE n BETWEEN 1 AND COALESCE(_slot_count, 0);

  IF _nums IS NULL OR array_length(_nums, 1) IS NULL THEN
    RAISE EXCEPTION 'Choose at least one available character';
  END IF;

  IF array_length(_nums, 1) > 10 THEN
    RAISE EXCEPTION 'Claim up to 10 characters at a time';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.break_slots bs
    WHERE bs.stream_id = _stream_id
      AND bs.slot_number = ANY(_nums)
  ) THEN
    RAISE EXCEPTION 'One of those characters was just claimed';
  END IF;

  SELECT COALESCE(p.username, 'buyer'),
         COALESCE(p.full_name, p.username, 'Buyer'),
         COALESCE(p.address_line1, ''),
         COALESCE(p.address_city, ''),
         COALESCE(p.address_state, ''),
         COALESCE(p.address_zip, ''),
         COALESCE(p.address_country, 'US')
    INTO _username, _full_name, _address, _city, _state, _zip, _country
  FROM public.profiles p
  WHERE p.id = _buyer;

  SELECT array_agg(
           COALESCE(NULLIF(_characters ->> (n - 1), ''), COALESCE(_prefix, '#') || n::text)
           ORDER BY n
         )
    INTO _labels
  FROM unnest(_nums) AS n;

  INSERT INTO public.orders (
    buyer_id,
    seller_id,
    title,
    description,
    amount,
    item_image_url,
    stream_id,
    status,
    payment_status,
    paid_at,
    ship_name,
    ship_address,
    ship_city,
    ship_state,
    ship_zip,
    ship_country
  ) VALUES (
    _buyer,
    _seller,
    'Mystery Break — ' || array_length(_nums, 1)::text || ' character' || CASE WHEN array_length(_nums, 1) = 1 THEN '' ELSE 's' END,
    'Mystery Break in ' || COALESCE(_stream_title, 'live stream') || ': ' || array_to_string(_labels, ', '),
    _price * array_length(_nums, 1),
    _item_image,
    _stream_id,
    'pending',
    'paid',
    now(),
    _full_name,
    _address,
    _city,
    _state,
    _zip,
    _country
  )
  RETURNING id INTO _order_id;

  INSERT INTO public.break_slots (
    stream_id,
    buyer_id,
    buyer_username,
    amount,
    slot_number,
    character_label,
    team_label,
    assigned_at,
    order_id
  )
  SELECT _stream_id,
         _buyer,
         _username,
         _price,
         n,
         COALESCE(NULLIF(_characters ->> (n - 1), ''), COALESCE(_prefix, '#') || n::text),
         COALESCE(NULLIF(_characters ->> (n - 1), ''), COALESCE(_prefix, '#') || n::text),
         now(),
         _order_id
  FROM unnest(_nums) AS n;

  order_id := _order_id;
  claimed_count := array_length(_nums, 1);
  total_amount := _price * claimed_count;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_break_slots(uuid, integer[]) TO authenticated;