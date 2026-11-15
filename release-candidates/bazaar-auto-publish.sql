-- Allow a supplier product to publish when it has at least one approved option and no demo links.
-- Rejected/pending options stay hidden from shoppers by bazaar_public_variant_availability ('unavailable').
CREATE OR REPLACE FUNCTION public.bazaar_block_demo_publish()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF NEW.status = 'published' AND EXISTS (SELECT 1 FROM public.bazaar_supplier_product_links WHERE product_id = NEW.id) THEN
    IF EXISTS (SELECT 1 FROM public.bazaar_supplier_product_links l JOIN public.bazaar_suppliers s ON s.id = l.supplier_id WHERE l.product_id = NEW.id AND s.is_demo) THEN
      RAISE EXCEPTION 'Demo supplier products cannot be published';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.bazaar_supplier_product_links l JOIN public.bazaar_product_variants v ON v.id = l.variant_id
                   WHERE l.product_id = NEW.id AND l.review_status = 'approved' AND l.sync_status = 'ok' AND v.is_active) THEN
      RAISE EXCEPTION 'Supplier products need at least one approved, verified, active option';
    END IF;
  END IF;
  RETURN NEW;
END $function$;
-- Rollback: restore previous body (any non-approved link blocks publish) -- saved in bazaar-auto-publish-rollback.sql
