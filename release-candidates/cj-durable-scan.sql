-- REVIEW ONLY. Do not apply until separately approved. Scheduling activation is separate.
-- Stores coordination/checkpoints only; no supplier orders, checkout or publishing.
CREATE TABLE public.bazaar_catalog_scan_runs (
  supplier_id uuid PRIMARY KEY REFERENCES public.bazaar_suppliers(id),
  status text NOT NULL DEFAULT 'paused' CHECK (status IN ('paused','running','completed','failed')),
  checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb,
  lease_owner uuid,
  lease_until timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bazaar_catalog_scan_runs TO authenticated;
GRANT ALL ON public.bazaar_catalog_scan_runs TO service_role;
ALTER TABLE public.bazaar_catalog_scan_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Bazaar admins read scan progress" ON public.bazaar_catalog_scan_runs
FOR SELECT TO authenticated USING (public.is_bazaar_admin(auth.uid()));

CREATE FUNCTION public.bazaar_claim_catalog_scan(p_supplier uuid, p_owner uuid)
RETURNS SETOF public.bazaar_catalog_scan_runs
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.bazaar_catalog_scan_runs SET lease_owner=p_owner,
    lease_until=pg_catalog.now()+interval '2 minutes',updated_at=pg_catalog.now()
  WHERE supplier_id=p_supplier AND status='running'
    AND next_attempt_at <= pg_catalog.now()
    AND (lease_until IS NULL OR lease_until < pg_catalog.now())
  RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.bazaar_claim_catalog_scan(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bazaar_claim_catalog_scan(uuid,uuid) TO service_role;

CREATE FUNCTION public.bazaar_save_catalog_scan(p_supplier uuid,p_owner uuid,p_checkpoint jsonb,p_done boolean,p_error text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.bazaar_catalog_scan_runs SET checkpoint=p_checkpoint,
    status=CASE WHEN p_done THEN 'completed' ELSE status END,
    lease_owner=NULL,lease_until=NULL,last_error=p_error,
    next_attempt_at=pg_catalog.now()+CASE WHEN p_error IS NULL THEN interval '0 seconds' ELSE interval '2 minutes' END,
    updated_at=pg_catalog.now()
  WHERE supplier_id=p_supplier AND lease_owner=p_owner AND lease_until>pg_catalog.now();
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.bazaar_save_catalog_scan(uuid,uuid,jsonb,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bazaar_save_catalog_scan(uuid,uuid,jsonb,boolean,text) TO service_role;

-- Additive snapshot backfill: retain the newest saved cursor; do not restart completed categories.
INSERT INTO public.bazaar_catalog_scan_runs(supplier_id,checkpoint)
SELECT DISTINCT ON (supplier_id) supplier_id,details
FROM public.bazaar_supplier_events WHERE event_type='bulk_checkpoint'
ORDER BY supplier_id,created_at DESC;