-- RELEASE CANDIDATE — NOT APPLIED. Requires isolated test copy + separate approval.
-- Phase 2: Marketplace local pickup
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS fulfillment_type text NOT NULL DEFAULT 'shipping';
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS pickup_area text;
ALTER TABLE public.listings ADD CONSTRAINT listings_fulfillment_type_chk CHECK (fulfillment_type IN ('shipping','pickup','both'));
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS fulfillment_method text NOT NULL DEFAULT 'shipping';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS handoff_code_hash text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS handoff_confirmed_at timestamptz;
ALTER TABLE public.orders ADD CONSTRAINT orders_fulfillment_method_chk CHECK (fulfillment_method IN ('shipping','pickup'));
-- Trigger: reject pickup unless seller verified and not restricted (implemented in test copy).

-- Phase 3: Official PB Store catalog (owner/admin write only)
CREATE TABLE public.pb_store_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL, description text, image_url text,
  cost_cents integer NOT NULL DEFAULT 0, msrp_cents integer NOT NULL,
  stock integer NOT NULL DEFAULT 0, published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pb_store_products TO authenticated;
GRANT ALL ON public.pb_store_products TO service_role;
ALTER TABLE public.pb_store_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "PB Store staff manage" ON public.pb_store_products FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));
-- Shoppers read published products through a safe-column projection (no cost_cents).
