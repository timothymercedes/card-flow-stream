CREATE TABLE public.bazaar_stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  store_type text NOT NULL DEFAULT 'independent' CHECK (store_type IN ('independent','brand','pb_owned')),
  owner_id uuid NOT NULL,
  logo_url text,
  cover_url text,
  description text CHECK (char_length(description) <= 2000),
  category text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_review','active','rejected','suspended','closed')),
  verification_status text NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified','pending','verified','rejected')),
  application_notes text CHECK (char_length(application_notes) <= 4000),
  review_notes text,
  shipping_policy text,
  return_policy text,
  processing_days int CHECK (processing_days BETWEEN 0 AND 60),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
CREATE INDEX bazaar_stores_status_idx ON public.bazaar_stores(status);
CREATE INDEX bazaar_stores_owner_idx ON public.bazaar_stores(owner_id);

CREATE TABLE public.bazaar_store_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.bazaar_stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('owner','admin','catalog','fulfillment','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, user_id)
);

CREATE TABLE public.bazaar_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.bazaar_stores(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 160),
  description text,
  department text,
  subcategory text,
  brand text,
  model text,
  specifications jsonb NOT NULL DEFAULT '{}'::jsonb,
  images text[] NOT NULL DEFAULT '{}',
  video_url text,
  condition text NOT NULL DEFAULT 'new' CHECK (condition IN ('new','refurbished','used')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','published','paused','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
CREATE INDEX bazaar_products_store_idx ON public.bazaar_products(store_id, status);

CREATE TABLE public.bazaar_product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.bazaar_products(id) ON DELETE CASCADE,
  sku text,
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  price_cents int NOT NULL CHECK (price_cents >= 0),
  compare_at_cents int CHECK (compare_at_cents IS NULL OR compare_at_cents > price_cents),
  quantity int NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bazaar_variants_product_idx ON public.bazaar_product_variants(product_id);
CREATE UNIQUE INDEX bazaar_variants_sku_uq ON public.bazaar_product_variants(product_id, sku) WHERE sku IS NOT NULL;

GRANT SELECT ON public.bazaar_stores, public.bazaar_products, public.bazaar_product_variants TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bazaar_stores, public.bazaar_store_members, public.bazaar_products, public.bazaar_product_variants TO authenticated;
GRANT ALL ON public.bazaar_stores, public.bazaar_store_members, public.bazaar_products, public.bazaar_product_variants TO service_role;

ALTER TABLE public.bazaar_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bazaar_store_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bazaar_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bazaar_product_variants ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_bazaar_admin(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_uid,'admin') OR public.has_role(_uid,'owner')
$$;

CREATE OR REPLACE FUNCTION public.bazaar_store_role_in(_store uuid, _uid uuid, _roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.bazaar_stores s WHERE s.id = _store AND s.owner_id = _uid)
      OR EXISTS (SELECT 1 FROM public.bazaar_store_members m WHERE m.store_id = _store AND m.user_id = _uid AND m.role = ANY(_roles))
$$;

CREATE OR REPLACE FUNCTION public.bazaar_store_is_active(_store uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.bazaar_stores WHERE id = _store AND status = 'active')
$$;

REVOKE EXECUTE ON FUNCTION public.is_bazaar_admin(uuid), public.bazaar_store_role_in(uuid,uuid,text[]), public.bazaar_store_is_active(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_bazaar_admin(uuid), public.bazaar_store_role_in(uuid,uuid,text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bazaar_store_is_active(uuid) TO anon, authenticated;

-- Guard: non-admins cannot self-approve, verify, or create PB-owned stores
CREATE OR REPLACE FUNCTION public.bazaar_stores_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF auth.uid() IS NULL OR public.is_bazaar_admin(auth.uid()) THEN
    IF NEW.status = 'active' AND NEW.published_at IS NULL THEN NEW.published_at := now(); END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.store_type = 'pb_owned' THEN RAISE EXCEPTION 'PB-owned stores are created by PullBid administration'; END IF;
    IF NEW.status NOT IN ('draft','pending_review') THEN NEW.status := 'draft'; END IF;
    NEW.verification_status := CASE WHEN NEW.status = 'pending_review' THEN 'pending' ELSE 'unverified' END;
    NEW.review_notes := NULL; NEW.published_at := NULL;
  ELSE
    IF NEW.owner_id <> OLD.owner_id OR NEW.store_type <> OLD.store_type OR NEW.slug <> OLD.slug
       OR NEW.verification_status IS DISTINCT FROM OLD.verification_status AND NOT (OLD.status IN ('draft','rejected') AND NEW.status = 'pending_review' AND NEW.verification_status = 'pending')
       OR NEW.review_notes IS DISTINCT FROM OLD.review_notes OR NEW.published_at IS DISTINCT FROM OLD.published_at THEN
      RAISE EXCEPTION 'Not allowed to change review fields';
    END IF;
    IF NEW.status <> OLD.status AND NOT (
      (OLD.status IN ('draft','rejected') AND NEW.status = 'pending_review') OR
      (OLD.status = 'pending_review' AND NEW.status = 'draft') OR
      (OLD.status = 'active' AND NEW.status = 'closed')) THEN
      RAISE EXCEPTION 'Store status change requires review';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bazaar_stores_guard_trg BEFORE INSERT OR UPDATE ON public.bazaar_stores FOR EACH ROW EXECUTE FUNCTION public.bazaar_stores_guard();

CREATE OR REPLACE FUNCTION public.bazaar_touch() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now();
  IF TG_TABLE_NAME = 'bazaar_products' AND NEW.status = 'published' AND NEW.published_at IS NULL THEN NEW.published_at := now(); END IF;
  RETURN NEW; END $$;
CREATE TRIGGER bazaar_products_touch BEFORE INSERT OR UPDATE ON public.bazaar_products FOR EACH ROW EXECUTE FUNCTION public.bazaar_touch();
CREATE TRIGGER bazaar_variants_touch BEFORE UPDATE ON public.bazaar_product_variants FOR EACH ROW EXECUTE FUNCTION public.bazaar_touch();

-- Stores
CREATE POLICY "Public sees active stores" ON public.bazaar_stores FOR SELECT TO anon, authenticated USING (status = 'active');
CREATE POLICY "Members see own stores" ON public.bazaar_stores FOR SELECT TO authenticated USING (public.bazaar_store_role_in(id, auth.uid(), ARRAY['owner','admin','catalog','fulfillment','viewer']));
CREATE POLICY "Admins see all stores" ON public.bazaar_stores FOR SELECT TO authenticated USING (public.is_bazaar_admin(auth.uid()));
CREATE POLICY "Users apply for stores" ON public.bazaar_stores FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid() OR public.is_bazaar_admin(auth.uid()));
CREATE POLICY "Store admins update" ON public.bazaar_stores FOR UPDATE TO authenticated
  USING (public.bazaar_store_role_in(id, auth.uid(), ARRAY['owner','admin']) OR public.is_bazaar_admin(auth.uid()))
  WITH CHECK (public.bazaar_store_role_in(id, auth.uid(), ARRAY['owner','admin']) OR public.is_bazaar_admin(auth.uid()));

-- Members
CREATE POLICY "Members see team" ON public.bazaar_store_members FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.bazaar_store_role_in(store_id, auth.uid(), ARRAY['owner','admin']) OR public.is_bazaar_admin(auth.uid()));
CREATE POLICY "Owners manage team" ON public.bazaar_store_members FOR ALL TO authenticated
  USING (public.bazaar_store_role_in(store_id, auth.uid(), ARRAY['owner']) OR public.is_bazaar_admin(auth.uid()))
  WITH CHECK ((public.bazaar_store_role_in(store_id, auth.uid(), ARRAY['owner']) AND role <> 'owner') OR public.is_bazaar_admin(auth.uid()));

-- Products
CREATE POLICY "Public sees published products" ON public.bazaar_products FOR SELECT TO anon, authenticated USING (status = 'published' AND public.bazaar_store_is_active(store_id));
CREATE POLICY "Staff see store products" ON public.bazaar_products FOR SELECT TO authenticated USING (public.bazaar_store_role_in(store_id, auth.uid(), ARRAY['owner','admin','catalog','fulfillment','viewer']) OR public.is_bazaar_admin(auth.uid()));
CREATE POLICY "Catalog staff write products" ON public.bazaar_products FOR ALL TO authenticated
  USING (public.bazaar_store_role_in(store_id, auth.uid(), ARRAY['owner','admin','catalog']) OR public.is_bazaar_admin(auth.uid()))
  WITH CHECK (public.bazaar_store_role_in(store_id, auth.uid(), ARRAY['owner','admin','catalog']) OR public.is_bazaar_admin(auth.uid()));

-- Variants
CREATE POLICY "Public sees published variants" ON public.bazaar_product_variants FOR SELECT TO anon, authenticated
  USING (is_active AND EXISTS (SELECT 1 FROM public.bazaar_products p WHERE p.id = product_id AND p.status = 'published' AND public.bazaar_store_is_active(p.store_id)));
CREATE POLICY "Staff see variants" ON public.bazaar_product_variants FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bazaar_products p WHERE p.id = product_id AND (public.bazaar_store_role_in(p.store_id, auth.uid(), ARRAY['owner','admin','catalog','fulfillment','viewer']) OR public.is_bazaar_admin(auth.uid()))));
CREATE POLICY "Catalog staff write variants" ON public.bazaar_product_variants FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bazaar_products p WHERE p.id = product_id AND (public.bazaar_store_role_in(p.store_id, auth.uid(), ARRAY['owner','admin','catalog']) OR public.is_bazaar_admin(auth.uid()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.bazaar_products p WHERE p.id = product_id AND (public.bazaar_store_role_in(p.store_id, auth.uid(), ARRAY['owner','admin','catalog']) OR public.is_bazaar_admin(auth.uid()))));

COMMENT ON TABLE public.bazaar_stores IS 'PB Bazaar multi-store retail; isolated from listings and PB Store.';