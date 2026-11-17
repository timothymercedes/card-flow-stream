CREATE TABLE public.listing_boost_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  packages jsonb NOT NULL DEFAULT '[{"key":"p2","hours":2,"cents":200,"weight":2},{"key":"p5","hours":4,"cents":500,"weight":3},{"key":"p10","hours":8,"cents":1000,"weight":4},{"key":"p15","hours":12,"cents":1500,"weight":5}]'::jsonb,
  custom_cents_per_hour integer NOT NULL DEFAULT 125 CHECK (custom_cents_per_hour BETWEEN 50 AND 10000),
  custom_min_hours integer NOT NULL DEFAULT 1 CHECK (custom_min_hours >= 1),
  custom_max_hours integer NOT NULL DEFAULT 24 CHECK (custom_max_hours BETWEEN 1 AND 24),
  custom_weight integer NOT NULL DEFAULT 3 CHECK (custom_weight BETWEEN 1 AND 10),
  free_hours integer NOT NULL DEFAULT 4 CHECK (free_hours BETWEEN 1 AND 24),
  free_cooldown_days integer NOT NULL DEFAULT 7 CHECK (free_cooldown_days BETWEEN 1 AND 30),
  free_weight integer NOT NULL DEFAULT 1 CHECK (free_weight BETWEEN 1 AND 10),
  feed_percent integer NOT NULL DEFAULT 10 CHECK (feed_percent BETWEEN 1 AND 10),
  max_paid_per_seller integer NOT NULL DEFAULT 2 CHECK (max_paid_per_seller BETWEEN 1 AND 5),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT ON public.listing_boost_settings TO anon, authenticated;
GRANT UPDATE ON public.listing_boost_settings TO authenticated;
GRANT ALL ON public.listing_boost_settings TO service_role;
ALTER TABLE public.listing_boost_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "boost settings readable" ON public.listing_boost_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "staff edit boost settings" ON public.listing_boost_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));
INSERT INTO public.listing_boost_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE TABLE public.listing_boosts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('free','paid')),
  package_key text NOT NULL,
  hours integer NOT NULL CHECK (hours BETWEEN 1 AND 24),
  amount_cents integer NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  weight integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','expired','cancelled')),
  environment text NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox','live')),
  starts_at timestamptz,
  ends_at timestamptz,
  stripe_checkout_session_id text UNIQUE,
  stripe_payment_intent_id text,
  cancelled_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX listing_boosts_active_idx ON public.listing_boosts (status, ends_at);
CREATE INDEX listing_boosts_seller_idx ON public.listing_boosts (seller_id, created_at DESC);
GRANT SELECT ON public.listing_boosts TO authenticated;
GRANT ALL ON public.listing_boosts TO service_role;
ALTER TABLE public.listing_boosts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sellers read own boosts" ON public.listing_boosts FOR SELECT TO authenticated
  USING (seller_id = auth.uid() OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));

-- Shared limit check (caller holds the seller lock).
CREATE OR REPLACE FUNCTION public._listing_boost_guard(_seller uuid, _listing uuid, _kind text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.listing_boost_settings;
BEGIN
  SELECT * INTO s FROM public.listing_boost_settings WHERE id;
  IF NOT EXISTS (SELECT 1 FROM public.listings l WHERE l.id=_listing AND l.seller_id=_seller AND l.visibility='public'
      AND l.expires_at>now() AND l.auction_status NOT IN ('draft','private','cancelled')) THEN
    RAISE EXCEPTION 'BOOST_LISTING_NOT_ELIGIBLE'; END IF;
  IF EXISTS (SELECT 1 FROM public.listing_boosts b WHERE b.listing_id=_listing AND b.status='active' AND b.ends_at>now()) THEN
    RAISE EXCEPTION 'BOOST_ALREADY_ACTIVE'; END IF;
  IF _kind='paid' AND (SELECT count(*) FROM public.listing_boosts b WHERE b.seller_id=_seller AND b.kind='paid' AND b.status='active' AND b.ends_at>now()) >= s.max_paid_per_seller THEN
    RAISE EXCEPTION 'BOOST_SELLER_LIMIT'; END IF;
  IF _kind='free' AND EXISTS (SELECT 1 FROM public.listing_boosts b WHERE b.seller_id=_seller AND b.kind='free' AND b.status IN ('active','expired','cancelled')
      AND b.starts_at > now() - make_interval(days => s.free_cooldown_days)) THEN
    RAISE EXCEPTION 'BOOST_FREE_USED'; END IF;
END $$;
REVOKE ALL ON FUNCTION public._listing_boost_guard(uuid,uuid,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.start_free_listing_boost(_listing_id uuid)
RETURNS public.listing_boosts LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); s public.listing_boost_settings; r public.listing_boosts;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('listing_boost:'||uid::text));
  SELECT * INTO s FROM public.listing_boost_settings WHERE id;
  PERFORM public._listing_boost_guard(uid, _listing_id, 'free');
  INSERT INTO public.listing_boosts (listing_id, seller_id, kind, package_key, hours, amount_cents, weight, status, environment, starts_at, ends_at)
  VALUES (_listing_id, uid, 'free', 'free', s.free_hours, 0, s.free_weight, 'active', 'live', now(), now() + make_interval(hours => s.free_hours))
  RETURNING * INTO r;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.start_free_listing_boost(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_free_listing_boost(uuid) TO authenticated;

-- Service-only: pending paid boost priced from settings.
CREATE OR REPLACE FUNCTION public.create_paid_listing_boost(_seller uuid, _listing_id uuid, _package text, _hours integer, _environment text)
RETURNS public.listing_boosts LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.listing_boost_settings; p jsonb; h int; c int; w int; r public.listing_boosts;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('listing_boost:'||_seller::text));
  SELECT * INTO s FROM public.listing_boost_settings WHERE id;
  IF _package='custom' THEN
    IF _hours IS NULL OR _hours < s.custom_min_hours OR _hours > s.custom_max_hours THEN RAISE EXCEPTION 'BOOST_INVALID_HOURS'; END IF;
    h := _hours; c := _hours * s.custom_cents_per_hour; w := s.custom_weight;
  ELSE
    SELECT e INTO p FROM jsonb_array_elements(s.packages) e WHERE e->>'key'=_package;
    IF p IS NULL THEN RAISE EXCEPTION 'BOOST_INVALID_PACKAGE'; END IF;
    h := (p->>'hours')::int; c := (p->>'cents')::int; w := COALESCE((p->>'weight')::int,2);
  END IF;
  IF c < 50 THEN RAISE EXCEPTION 'BOOST_INVALID_PRICE'; END IF;
  PERFORM public._listing_boost_guard(_seller, _listing_id, 'paid');
  UPDATE public.listing_boosts SET status='cancelled' WHERE listing_id=_listing_id AND status='pending';
  INSERT INTO public.listing_boosts (listing_id, seller_id, kind, package_key, hours, amount_cents, weight, status, environment)
  VALUES (_listing_id, _seller, 'paid', _package, h, c, w, 'pending', _environment) RETURNING * INTO r;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.create_paid_listing_boost(uuid,uuid,text,integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_paid_listing_boost(uuid,uuid,text,integer,text) TO service_role;

-- Service-only: verified payment switches the boost on; the clock starts at payment time.
CREATE OR REPLACE FUNCTION public.activate_listing_boost(_boost_id uuid, _amount integer, _session text, _intent text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.listing_boosts;
BEGIN
  SELECT * INTO b FROM public.listing_boosts WHERE id=_boost_id FOR UPDATE;
  IF b.id IS NULL THEN RAISE EXCEPTION 'BOOST_MISSING'; END IF;
  IF b.status='active' THEN RETURN 'already_active'; END IF;
  IF b.status<>'pending' THEN RETURN 'not_pending'; END IF;
  IF b.amount_cents<>_amount THEN RAISE EXCEPTION 'BOOST_AMOUNT_MISMATCH'; END IF;
  IF b.stripe_checkout_session_id IS DISTINCT FROM _session THEN RAISE EXCEPTION 'BOOST_SESSION_MISMATCH'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('listing_boost:'||b.seller_id::text));
  BEGIN
    PERFORM public._listing_boost_guard(b.seller_id, b.listing_id, 'paid');
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.listing_boosts SET status='cancelled', stripe_payment_intent_id=_intent WHERE id=b.id;
    RETURN 'limit_reached_needs_review';
  END;
  UPDATE public.listing_boosts SET status='active', starts_at=now(), ends_at=now()+make_interval(hours => b.hours), stripe_payment_intent_id=_intent WHERE id=b.id;
  RETURN 'activated';
END $$;
REVOKE ALL ON FUNCTION public.activate_listing_boost(uuid,integer,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_listing_boost(uuid,integer,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.cancel_listing_boost(_boost_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  UPDATE public.listing_boosts SET status='cancelled', cancelled_by=auth.uid(), ends_at=LEAST(COALESCE(ends_at,now()),now()) WHERE id=_boost_id AND status IN ('active','pending');
END $$;
REVOKE ALL ON FUNCTION public.cancel_listing_boost(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_listing_boost(uuid) TO authenticated;

-- Public projection: active, unexpired boosts on visible listings only; no payment fields.
CREATE OR REPLACE FUNCTION public.public_listing_boosts(_department text DEFAULT 'all')
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'boost_id', b.id, 'boost_kind', b.kind, 'boost_weight', b.weight, 'boost_ends_at', b.ends_at,
  'id',l.id,'title',l.title,'image_url',l.image_url,'seller_id',l.seller_id,'category',l.category,'department',COALESCE(l.department,'collectibles'),
  'condition',l.condition,'price',l.price,'buy_now_price',l.buy_now_price,'current_bid',l.current_bid,'starting_bid',l.starting_bid,
  'is_auction',l.is_auction,'listing_type',l.listing_type,'accepts_offers',l.accepts_offers,'quantity',l.quantity,'sold_count',l.sold_count,
  'expires_at',l.expires_at,'auction_ends_at',l.auction_ends_at,'created_at',l.created_at,'storefront_name',p.shop_name,'storefront_username',p.username)), '[]'::jsonb)
FROM public.listing_boosts b JOIN public.listings l ON l.id=b.listing_id LEFT JOIN public.profiles p ON p.id=l.seller_id
WHERE b.status='active' AND b.starts_at<=now() AND b.ends_at>now()
  AND l.visibility='public' AND l.expires_at>now() AND l.auction_status NOT IN ('draft','private','cancelled')
  AND (_department='all' OR COALESCE(l.department,'collectibles')=_department);
$$;
GRANT EXECUTE ON FUNCTION public.public_listing_boosts(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.expire_listing_boosts()
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
WITH u AS (UPDATE public.listing_boosts SET status='expired' WHERE status='active' AND ends_at<=now() RETURNING 1) SELECT count(*)::int FROM u;
$$;
REVOKE ALL ON FUNCTION public.expire_listing_boosts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_listing_boosts() TO service_role;