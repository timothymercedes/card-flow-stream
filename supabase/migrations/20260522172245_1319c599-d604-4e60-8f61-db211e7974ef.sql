
-- =========================================
-- Enums
-- =========================================
CREATE TYPE public.insurance_default_mode AS ENUM ('off','optional','required');
CREATE TYPE public.insurance_status AS ENUM ('none','requested','active','claim_pending','claim_approved','claim_denied','reimbursed');
CREATE TYPE public.insurance_payer AS ENUM ('buyer','seller');
CREATE TYPE public.insurance_claim_reason AS ENUM ('lost','damaged','stolen');
CREATE TYPE public.insurance_claim_status AS ENUM ('draft','submitted','under_review','approved','denied','paid');
CREATE TYPE public.payout_adjustment_kind AS ENUM ('insurance_fee','insurance_reimbursement','refund','manual');

-- =========================================
-- Listings additions
-- =========================================
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS insurance_default public.insurance_default_mode NOT NULL DEFAULT 'optional',
  ADD COLUMN IF NOT EXISTS insurance_auto_add_by_seller boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS insurance_paid_by public.insurance_payer NOT NULL DEFAULT 'buyer';

-- =========================================
-- Orders additions
-- =========================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS insurance_status public.insurance_status NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS insurance_provider text,
  ADD COLUMN IF NOT EXISTS insurance_coverage_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS insurance_fee_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS insurance_paid_by public.insurance_payer,
  ADD COLUMN IF NOT EXISTS insurance_purchased_at timestamptz,
  ADD COLUMN IF NOT EXISTS insurance_provider_ref text,
  ADD COLUMN IF NOT EXISTS insurance_added_post_purchase boolean NOT NULL DEFAULT false;

-- =========================================
-- Insurance providers registry
-- =========================================
CREATE TABLE IF NOT EXISTS public.insurance_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  display_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  supports_lost boolean NOT NULL DEFAULT true,
  supports_damaged boolean NOT NULL DEFAULT true,
  supports_stolen boolean NOT NULL DEFAULT false,
  min_cents integer NOT NULL DEFAULT 0,
  max_cents integer NOT NULL DEFAULT 1000000,
  rate_bps integer NOT NULL DEFAULT 100,
  flat_cents integer NOT NULL DEFAULT 0,
  est_resolution_days integer NOT NULL DEFAULT 14,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.insurance_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "providers_public_read" ON public.insurance_providers
  FOR SELECT USING (true);
CREATE POLICY "providers_admin_write" ON public.insurance_providers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.insurance_providers (code, display_name, is_active, supports_stolen, rate_bps, flat_cents, est_resolution_days)
VALUES
  ('shippo',    'Shippo Insurance',     true,  false, 100, 50, 10),
  ('shipsurance','Shipsurance',         false, true,  85,  75, 14),
  ('usps',      'USPS Insurance',       false, false, 90,  225, 30),
  ('ups',       'UPS Declared Value',   false, false, 105, 300, 21),
  ('fedex',     'FedEx Declared Value', false, false, 110, 300, 21)
ON CONFLICT (code) DO NOTHING;

-- =========================================
-- Insurance claims
-- =========================================
CREATE TABLE IF NOT EXISTS public.insurance_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  claimant_user_id uuid NOT NULL,
  reason public.insurance_claim_reason NOT NULL,
  description text,
  claim_amount_cents integer NOT NULL,
  status public.insurance_claim_status NOT NULL DEFAULT 'draft',
  provider_code text,
  provider_claim_ref text,
  admin_notes text,
  decided_by uuid,
  decided_at timestamptz,
  reimbursed_cents integer NOT NULL DEFAULT 0,
  reimbursed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_order ON public.insurance_claims(order_id);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_claimant ON public.insurance_claims(claimant_user_id);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_status ON public.insurance_claims(status);

ALTER TABLE public.insurance_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "claims_seller_select" ON public.insurance_claims
  FOR SELECT TO authenticated
  USING (
    claimant_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.seller_id = auth.uid() OR o.buyer_id = auth.uid()))
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "claims_seller_insert" ON public.insurance_claims
  FOR INSERT TO authenticated
  WITH CHECK (
    claimant_user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.seller_id = auth.uid())
  );

CREATE POLICY "claims_claimant_update_draft" ON public.insurance_claims
  FOR UPDATE TO authenticated
  USING (claimant_user_id = auth.uid() AND status IN ('draft','submitted'))
  WITH CHECK (claimant_user_id = auth.uid());

CREATE POLICY "claims_admin_update" ON public.insurance_claims
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================
-- Claim evidence
-- =========================================
CREATE TABLE IF NOT EXISTS public.insurance_claim_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES public.insurance_claims(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL,
  file_path text NOT NULL,
  kind text NOT NULL DEFAULT 'photo',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_claim_evidence_claim ON public.insurance_claim_evidence(claim_id);

ALTER TABLE public.insurance_claim_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "evidence_select" ON public.insurance_claim_evidence
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.insurance_claims c
      WHERE c.id = claim_id
        AND (c.claimant_user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
    )
  );
CREATE POLICY "evidence_insert" ON public.insurance_claim_evidence
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.insurance_claims c
      WHERE c.id = claim_id AND c.claimant_user_id = auth.uid()
    )
  );

-- =========================================
-- Payout adjustments (general purpose)
-- =========================================
CREATE TABLE IF NOT EXISTS public.payout_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  amount_cents integer NOT NULL,
  kind public.payout_adjustment_kind NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payout_adj_seller ON public.payout_adjustments(seller_id);
CREATE INDEX IF NOT EXISTS idx_payout_adj_order ON public.payout_adjustments(order_id);

ALTER TABLE public.payout_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "adj_seller_read" ON public.payout_adjustments
  FOR SELECT TO authenticated
  USING (seller_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "adj_admin_write" ON public.payout_adjustments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- =========================================
-- updated_at trigger for claims
-- =========================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_insurance_claims_updated ON public.insurance_claims;
CREATE TRIGGER trg_insurance_claims_updated
BEFORE UPDATE ON public.insurance_claims
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- Trigger: when claim approved, freeze that order from payout
-- =========================================
CREATE OR REPLACE FUNCTION public.sync_order_insurance_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'submitted' OR NEW.status = 'under_review' THEN
    UPDATE public.orders SET insurance_status = 'claim_pending', payout_held = true WHERE id = NEW.order_id;
  ELSIF NEW.status = 'approved' THEN
    UPDATE public.orders SET insurance_status = 'claim_approved' WHERE id = NEW.order_id;
  ELSIF NEW.status = 'denied' THEN
    UPDATE public.orders SET insurance_status = 'claim_denied', payout_held = false WHERE id = NEW.order_id;
  ELSIF NEW.status = 'paid' THEN
    UPDATE public.orders SET insurance_status = 'reimbursed' WHERE id = NEW.order_id;
    -- Credit seller for reimbursement
    INSERT INTO public.payout_adjustments (seller_id, order_id, amount_cents, kind, notes)
    SELECT o.seller_id, o.id, NEW.reimbursed_cents, 'insurance_reimbursement',
           'Insurance claim ' || NEW.id::text
    FROM public.orders o WHERE o.id = NEW.order_id AND NEW.reimbursed_cents > 0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_claim_status_sync ON public.insurance_claims;
CREATE TRIGGER trg_claim_status_sync
AFTER INSERT OR UPDATE OF status ON public.insurance_claims
FOR EACH ROW EXECUTE FUNCTION public.sync_order_insurance_status();

-- =========================================
-- Storage bucket: insurance-evidence (private)
-- =========================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('insurance-evidence', 'insurance-evidence', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "evidence_upload_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'insurance-evidence' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "evidence_read_own_or_admin" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'insurance-evidence'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(),'admin'))
  );
