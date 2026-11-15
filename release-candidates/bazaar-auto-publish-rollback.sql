-- Rollback for bazaar_auto_publish_rule. Restores the previous "every option must be approved" rule.
-- Hardened: empty search_path, schema-qualified tables, NULL-safe approval/demo checks. No data is deleted.
DROP TRIGGER IF EXISTS bazaar_spl_guard_verified ON public.bazaar_supplier_product_links;
DROP FUNCTION IF EXISTS public.bazaar_guard_link_verified();
CREATE OR REPLACE FUNCTION public.bazaar_block_demo_publish()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF NEW.status = 'published' AND EXISTS (
    SELECT 1 FROM public.bazaar_supplier_product_links l JOIN public.bazaar_suppliers s ON s.id = l.supplier_id
    WHERE l.product_id = NEW.id AND (s.is_demo IS NOT FALSE OR l.review_status IS DISTINCT FROM 'approved')) THEN
    RAISE EXCEPTION 'Supplier products must be admin-approved and cannot be demo items';
  END IF;
  RETURN NEW;
END $function$;
