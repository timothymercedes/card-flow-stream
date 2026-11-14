CREATE TABLE public.bazaar_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 2 AND 80),
  kind text NOT NULL CHECK (kind IN ('aliexpress','wish','temu','shein','manual','demo','other')),
  status text NOT NULL DEFAULT 'not_connected' CHECK (status IN ('not_connected','application_pending','approved','connected','paused','error','demo')),
  is_demo boolean NOT NULL DEFAULT false,
  delivery_min_days int NOT NULL DEFAULT 7 CHECK (delivery_min_days BETWEEN 0 AND 120),
  delivery_max_days int NOT NULL DEFAULT 21 CHECK (delivery_max_days BETWEEN 0 AND 180),
  stale_after_hours int NOT NULL DEFAULT 24 CHECK (stale_after_hours BETWEEN 1 AND 720),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (delivery_max_days >= delivery_min_days),
  CHECK ((is_demo AND status = 'demo') OR (NOT is_demo AND status <> 'demo'))
);

CREATE TABLE public.bazaar_pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('default','supplier','product')),
  supplier_id uuid REFERENCES public.bazaar_suppliers(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.bazaar_products(id) ON DELETE CASCADE,
  markup_percent numeric(7,2) NOT NULL DEFAULT 40 CHECK (markup_percent BETWEEN 0 AND 1000),
  markup_fixed_cents int NOT NULL DEFAULT 0 CHECK (markup_fixed_cents >= 0),
  min_profit_cents int NOT NULL DEFAULT 200 CHECK (min_profit_cents >= 0),
  min_margin_percent numeric(5,2) NOT NULL DEFAULT 15 CHECK (min_margin_percent BETWEEN 0 AND 90),
  shipping_cost_cents int NOT NULL DEFAULT 0 CHECK (shipping_cost_cents >= 0),
  fee_percent numeric(5,2) NOT NULL DEFAULT 2.9 CHECK (fee_percent BETWEEN 0 AND 50),
  fee_fixed_cents int NOT NULL DEFAULT 30 CHECK (fee_fixed_cents >= 0),
  other_cost_cents int NOT NULL DEFAULT 0 CHECK (other_cost_cents >= 0),
  round_to_cents int NOT NULL DEFAULT 1 CHECK (round_to_cents BETWEEN 1 AND 10000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope = 'default' AND supplier_id IS NULL AND product_id IS NULL)
      OR (scope = 'supplier' AND supplier_id IS NOT NULL AND product_id IS NULL)
      OR (scope = 'product' AND product_id IS NOT NULL AND supplier_id IS NULL))
);
CREATE UNIQUE INDEX bazaar_pricing_default_uq ON public.bazaar_pricing_rules(scope) WHERE scope = 'default';
CREATE UNIQUE INDEX bazaar_pricing_supplier_uq ON public.bazaar_pricing_rules(supplier_id) WHERE scope = 'supplier';
CREATE UNIQUE INDEX bazaar_pricing_product_uq ON public.bazaar_pricing_rules(product_id) WHERE scope = 'product';

CREATE TABLE public.bazaar_supplier_product_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.bazaar_suppliers(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.bazaar_products(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL UNIQUE REFERENCES public.bazaar_product_variants(id) ON DELETE CASCADE,
  supplier_item_ref text NOT NULL,
  supplier_sku text,
  supplier_cost_cents int NOT NULL CHECK (supplier_cost_cents >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  supplier_stock int CHECK (supplier_stock IS NULL OR supplier_stock >= 0),
  last_synced_at timestamptz,
  sync_status text NOT NULL DEFAULT 'unverified' CHECK (sync_status IN ('ok','stale','unverified','discontinued')),
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','approved','rejected')),
  price_override_cents int CHECK (price_override_cents IS NULL OR price_override_cents >= 0),
  computed_price_cents int,
  margin_cents int,
  below_floor boolean NOT NULL DEFAULT false,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_id, supplier_item_ref, supplier_sku)
);
CREATE INDEX bazaar_spl_product_idx ON public.bazaar_supplier_product_links(product_id);
CREATE INDEX bazaar_spl_review_idx ON public.bazaar_supplier_product_links(review_status);

CREATE TABLE public.bazaar_supplier_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.bazaar_suppliers(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('import','stock','price','demo_load')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','failed')),
  items_seen int NOT NULL DEFAULT 0,
  items_changed int NOT NULL DEFAULT 0,
  error text,
  started_by uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX bazaar_sync_jobs_supplier_idx ON public.bazaar_supplier_sync_jobs(supplier_id, started_at DESC);

CREATE TABLE public.bazaar_supplier_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid REFERENCES public.bazaar_supplier_product_links(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.bazaar_suppliers(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bazaar_supplier_events_created_idx ON public.bazaar_supplier_events(created_at DESC);

CREATE TABLE public.bazaar_auto_approval_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid REFERENCES public.bazaar_suppliers(id) ON DELETE CASCADE,
  name text NOT NULL,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT false CHECK (enabled = false),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN public.bazaar_auto_approval_rules.enabled IS 'Locked false until automatic publishing is separately approved.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bazaar_suppliers, public.bazaar_pricing_rules, public.bazaar_supplier_product_links, public.bazaar_supplier_sync_jobs, public.bazaar_auto_approval_rules TO authenticated;
GRANT SELECT, INSERT ON public.bazaar_supplier_events TO authenticated;
GRANT ALL ON public.bazaar_suppliers, public.bazaar_pricing_rules, public.bazaar_supplier_product_links, public.bazaar_supplier_sync_jobs, public.bazaar_supplier_events, public.bazaar_auto_approval_rules TO service_role;

ALTER TABLE public.bazaar_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bazaar_pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bazaar_supplier_product_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bazaar_supplier_sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bazaar_supplier_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bazaar_auto_approval_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Bazaar admins manage suppliers" ON public.bazaar_suppliers FOR ALL TO authenticated USING (public.is_bazaar_admin(auth.uid())) WITH CHECK (public.is_bazaar_admin(auth.uid()));
CREATE POLICY "Bazaar admins manage pricing" ON public.bazaar_pricing_rules FOR ALL TO authenticated USING (public.is_bazaar_admin(auth.uid())) WITH CHECK (public.is_bazaar_admin(auth.uid()));
CREATE POLICY "Bazaar admins manage supplier links" ON public.bazaar_supplier_product_links FOR ALL TO authenticated USING (public.is_bazaar_admin(auth.uid())) WITH CHECK (public.is_bazaar_admin(auth.uid()));
CREATE POLICY "Bazaar admins manage sync jobs" ON public.bazaar_supplier_sync_jobs FOR ALL TO authenticated USING (public.is_bazaar_admin(auth.uid())) WITH CHECK (public.is_bazaar_admin(auth.uid()));
CREATE POLICY "Bazaar admins read supplier events" ON public.bazaar_supplier_events FOR SELECT TO authenticated USING (public.is_bazaar_admin(auth.uid()));
CREATE POLICY "Bazaar admins add supplier events" ON public.bazaar_supplier_events FOR INSERT TO authenticated WITH CHECK (public.is_bazaar_admin(auth.uid()) AND actor = auth.uid());
CREATE POLICY "Bazaar admins manage auto rules" ON public.bazaar_auto_approval_rules FOR ALL TO authenticated USING (public.is_bazaar_admin(auth.uid())) WITH CHECK (public.is_bazaar_admin(auth.uid()));

CREATE TRIGGER bazaar_suppliers_touch BEFORE UPDATE ON public.bazaar_suppliers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER bazaar_pricing_touch BEFORE UPDATE ON public.bazaar_pricing_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER bazaar_spl_touch BEFORE UPDATE ON public.bazaar_supplier_product_links FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER bazaar_auto_rules_touch BEFORE UPDATE ON public.bazaar_auto_approval_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Log cost/stock/status changes automatically
CREATE OR REPLACE FUNCTION public.bazaar_log_supplier_link_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.supplier_cost_cents IS DISTINCT FROM OLD.supplier_cost_cents THEN
    INSERT INTO public.bazaar_supplier_events(link_id, supplier_id, event_type, details, actor) VALUES (NEW.id, NEW.supplier_id, 'cost_changed', jsonb_build_object('from', OLD.supplier_cost_cents, 'to', NEW.supplier_cost_cents), auth.uid());
  END IF;
  IF NEW.supplier_stock IS DISTINCT FROM OLD.supplier_stock THEN
    INSERT INTO public.bazaar_supplier_events(link_id, supplier_id, event_type, details, actor) VALUES (NEW.id, NEW.supplier_id, 'stock_changed', jsonb_build_object('from', OLD.supplier_stock, 'to', NEW.supplier_stock), auth.uid());
  END IF;
  IF NEW.sync_status IS DISTINCT FROM OLD.sync_status OR NEW.review_status IS DISTINCT FROM OLD.review_status THEN
    INSERT INTO public.bazaar_supplier_events(link_id, supplier_id, event_type, details, actor) VALUES (NEW.id, NEW.supplier_id, 'status_changed', jsonb_build_object('sync', NEW.sync_status, 'review', NEW.review_status), auth.uid());
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bazaar_spl_log AFTER UPDATE ON public.bazaar_supplier_product_links FOR EACH ROW EXECUTE FUNCTION public.bazaar_log_supplier_link_change();

-- Demo-linked products can never be published
CREATE OR REPLACE FUNCTION public.bazaar_block_demo_publish() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'published' AND EXISTS (
    SELECT 1 FROM public.bazaar_supplier_product_links l JOIN public.bazaar_suppliers s ON s.id = l.supplier_id
    WHERE l.product_id = NEW.id AND (s.is_demo OR l.review_status <> 'approved')) THEN
    RAISE EXCEPTION 'Supplier products must be admin-approved and cannot be demo items';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bazaar_products_block_demo BEFORE INSERT OR UPDATE OF status ON public.bazaar_products FOR EACH ROW EXECUTE FUNCTION public.bazaar_block_demo_publish();

-- Shopper-safe availability projection: no supplier, cost or internal IDs
CREATE OR REPLACE FUNCTION public.bazaar_public_variant_availability(_product_ids uuid[])
RETURNS TABLE (id uuid, product_id uuid, sku text, options jsonb, price_cents int, compare_at_cents int, quantity int, available boolean, reason text, delivery_min_days int, delivery_max_days int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT v.id, v.product_id, v.sku, v.options, v.price_cents, v.compare_at_cents,
    CASE WHEN r.reason IS NULL THEN v.quantity ELSE 0 END,
    r.reason IS NULL, r.reason, s.delivery_min_days, s.delivery_max_days
  FROM public.bazaar_product_variants v
  JOIN public.bazaar_products p ON p.id = v.product_id AND p.status = 'published'
  JOIN public.bazaar_stores st ON st.id = p.store_id AND st.status = 'active'
  LEFT JOIN public.bazaar_supplier_product_links l ON l.variant_id = v.id
  LEFT JOIN public.bazaar_suppliers s ON s.id = l.supplier_id
  CROSS JOIN LATERAL (SELECT CASE
    WHEN NOT v.is_active THEN 'unavailable'
    WHEN l.id IS NOT NULL AND (l.sync_status = 'discontinued' OR l.review_status <> 'approved' OR s.is_demo) THEN 'unavailable'
    WHEN l.id IS NOT NULL AND (l.sync_status IN ('unverified','stale') OR l.last_synced_at IS NULL OR l.last_synced_at < now() - make_interval(hours => s.stale_after_hours)) THEN 'unverified'
    WHEN v.quantity <= 0 THEN 'sold_out'
    ELSE NULL END AS reason) r
  WHERE v.product_id = ANY(_product_ids[1:100])
$$;
REVOKE EXECUTE ON FUNCTION public.bazaar_public_variant_availability(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bazaar_public_variant_availability(uuid[]) TO anon, authenticated, service_role;

-- Seed: default pricing, Wish (pending), internal PB Bazaar Direct store (draft until first approval)
INSERT INTO public.bazaar_pricing_rules(scope) SELECT 'default' WHERE NOT EXISTS (SELECT 1 FROM public.bazaar_pricing_rules WHERE scope = 'default');
INSERT INTO public.bazaar_suppliers(name, kind, status) VALUES ('Wish', 'wish', 'application_pending') ON CONFLICT (name) DO NOTHING;
INSERT INTO public.bazaar_suppliers(name, kind, status, is_demo, notes) VALUES ('Demo Supplier', 'demo', 'demo', true, 'Labeled demo data only. Never published.') ON CONFLICT (name) DO NOTHING;
INSERT INTO public.bazaar_stores(slug, name, store_type, owner_id, status, verification_status, description)
SELECT 'pb-bazaar-direct', 'PB Bazaar Direct', 'pb_owned', ur.user_id, 'draft', 'verified', 'Products curated and sold by PullBid.'
FROM public.user_roles ur WHERE ur.role = 'owner' AND NOT EXISTS (SELECT 1 FROM public.bazaar_stores WHERE slug = 'pb-bazaar-direct')
ORDER BY ur.user_id LIMIT 1;