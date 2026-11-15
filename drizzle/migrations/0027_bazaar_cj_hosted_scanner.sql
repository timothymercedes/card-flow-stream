CREATE TABLE public.bazaar_scan_coordinator (
  supplier_id uuid PRIMARY KEY REFERENCES public.bazaar_suppliers(id),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','paused','completed','failed')),
  checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_category_id text,
  lease_owner uuid,
  lease_until timestamptz,
  heartbeat_at timestamptz,
  last_run_at timestamptz,
  last_run_processed integer NOT NULL DEFAULT 0,
  last_error text,
  cron_token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(32),'hex'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT (supplier_id,status,checkpoint,current_category_id,lease_until,heartbeat_at,last_run_at,last_run_processed,last_error,updated_at) ON public.bazaar_scan_coordinator TO authenticated;
GRANT ALL ON public.bazaar_scan_coordinator TO service_role;
ALTER TABLE public.bazaar_scan_coordinator ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Bazaar admins read scan coordinator" ON public.bazaar_scan_coordinator FOR SELECT TO authenticated USING (public.is_bazaar_admin(auth.uid()));

CREATE TABLE public.bazaar_scan_outcomes (
  supplier_id uuid NOT NULL REFERENCES public.bazaar_suppliers(id),
  supplier_item_ref text NOT NULL,
  category_top text NOT NULL,
  category_id text,
  outcome text NOT NULL CHECK (outcome IN ('imported','duplicate','skipped','rejected','failed')),
  reason text,
  product_id uuid,
  attempts integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (supplier_id, supplier_item_ref)
);
CREATE INDEX bazaar_scan_outcomes_cat ON public.bazaar_scan_outcomes(supplier_id, category_top, outcome);
GRANT SELECT ON public.bazaar_scan_outcomes TO authenticated;
GRANT ALL ON public.bazaar_scan_outcomes TO service_role;
ALTER TABLE public.bazaar_scan_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Bazaar admins read scan outcomes" ON public.bazaar_scan_outcomes FOR SELECT TO authenticated USING (public.is_bazaar_admin(auth.uid()));

CREATE TABLE public.bazaar_backfill_queue (
  product_id uuid PRIMARY KEY REFERENCES public.bazaar_products(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.bazaar_suppliers(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','skipped','failed')),
  attempts integer NOT NULL DEFAULT 0,
  filled jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bazaar_backfill_queue TO authenticated;
GRANT ALL ON public.bazaar_backfill_queue TO service_role;
ALTER TABLE public.bazaar_backfill_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Bazaar admins read backfill queue" ON public.bazaar_backfill_queue FOR SELECT TO authenticated USING (public.is_bazaar_admin(auth.uid()));

CREATE FUNCTION public.bazaar_acquire_scan_lease(p_supplier uuid, p_owner uuid, p_seconds integer)
RETURNS SETOF public.bazaar_scan_coordinator
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_supplier IS NULL OR p_owner IS NULL THEN RAISE EXCEPTION 'supplier and owner required'; END IF;
  IF p_seconds IS NULL OR p_seconds < 10 OR p_seconds > 300 THEN RAISE EXCEPTION 'lease seconds must be between 10 and 300'; END IF;
  RETURN QUERY UPDATE public.bazaar_scan_coordinator c
    SET lease_owner = p_owner, lease_until = pg_catalog.now() + pg_catalog.make_interval(secs => p_seconds),
        heartbeat_at = pg_catalog.now(), updated_at = pg_catalog.now()
    WHERE c.supplier_id = p_supplier AND c.status = 'running'
      AND (c.lease_until IS NULL OR c.lease_until < pg_catalog.now())
    RETURNING c.*;
END; $$;

CREATE FUNCTION public.bazaar_save_scan_progress(p_supplier uuid, p_owner uuid, p_checkpoint jsonb, p_category_id text, p_processed integer, p_done boolean, p_error text, p_release boolean)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_checkpoint IS NULL OR pg_catalog.jsonb_typeof(p_checkpoint) <> 'object' THEN RAISE EXCEPTION 'checkpoint required'; END IF;
  UPDATE public.bazaar_scan_coordinator SET
    checkpoint = p_checkpoint,
    current_category_id = p_category_id,
    status = CASE WHEN p_done THEN 'completed' ELSE status END,
    heartbeat_at = pg_catalog.now(),
    last_run_processed = CASE WHEN p_release THEN COALESCE(p_processed,0) ELSE last_run_processed END,
    last_run_at = CASE WHEN p_release THEN pg_catalog.now() ELSE last_run_at END,
    last_error = CASE WHEN p_release THEN p_error ELSE last_error END,
    lease_owner = CASE WHEN p_release THEN NULL ELSE lease_owner END,
    lease_until = CASE WHEN p_release THEN NULL ELSE lease_until END,
    updated_at = pg_catalog.now()
  WHERE supplier_id = p_supplier AND lease_owner = p_owner AND lease_until > pg_catalog.now();
  RETURN FOUND;
END; $$;

CREATE FUNCTION public.bazaar_release_scan_lease(p_supplier uuid, p_owner uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.bazaar_scan_coordinator SET lease_owner = NULL, lease_until = NULL, updated_at = pg_catalog.now()
  WHERE supplier_id = p_supplier AND lease_owner = p_owner;
  RETURN FOUND;
END; $$;

REVOKE ALL ON FUNCTION public.bazaar_acquire_scan_lease(uuid,uuid,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bazaar_save_scan_progress(uuid,uuid,jsonb,text,integer,boolean,text,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bazaar_release_scan_lease(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bazaar_acquire_scan_lease(uuid,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.bazaar_save_scan_progress(uuid,uuid,jsonb,text,integer,boolean,text,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.bazaar_release_scan_lease(uuid,uuid) TO service_role;

INSERT INTO public.bazaar_scan_coordinator (supplier_id, checkpoint, current_category_id)
SELECT DISTINCT ON (e.supplier_id) e.supplier_id, e.details,
  e.details->'categories'->((e.details->'cursor'->>'catIndex')::int)->>'id'
FROM public.bazaar_supplier_events e
WHERE e.event_type = 'bulk_checkpoint'
ORDER BY e.supplier_id, e.created_at DESC
ON CONFLICT DO NOTHING;

INSERT INTO public.bazaar_scan_outcomes (supplier_id, supplier_item_ref, category_top, outcome, product_id)
SELECT DISTINCT ON (l.supplier_id, l.supplier_item_ref) l.supplier_id, l.supplier_item_ref,
  COALESCE(e.details->>'cj_category','Unknown'), 'imported', l.product_id
FROM public.bazaar_supplier_product_links l
JOIN public.bazaar_suppliers s ON s.id = l.supplier_id AND s.kind = 'cj'
LEFT JOIN public.bazaar_supplier_events e ON e.link_id = l.id AND e.event_type = 'imported'
WHERE l.supplier_item_ref IS NOT NULL
ORDER BY l.supplier_id, l.supplier_item_ref, e.created_at
ON CONFLICT DO NOTHING;

INSERT INTO public.bazaar_backfill_queue (product_id, supplier_id)
SELECT DISTINCT p.id, l.supplier_id
FROM public.bazaar_products p
JOIN public.bazaar_supplier_product_links l ON l.product_id = p.id
JOIN public.bazaar_suppliers s ON s.id = l.supplier_id AND s.kind = 'cj'
WHERE p.status = 'draft'
ON CONFLICT DO NOTHING;