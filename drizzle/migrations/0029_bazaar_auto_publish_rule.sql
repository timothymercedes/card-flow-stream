CREATE OR REPLACE FUNCTION public.bazaar_block_demo_publish()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF NEW.status = 'published' AND EXISTS (SELECT 1 FROM public.bazaar_supplier_product_links WHERE product_id = NEW.id) THEN
    IF EXISTS (SELECT 1 FROM public.bazaar_supplier_product_links l JOIN public.bazaar_suppliers s ON s.id = l.supplier_id WHERE l.product_id = NEW.id AND s.is_demo IS NOT FALSE) THEN
      RAISE EXCEPTION 'Demo supplier products cannot be published';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.bazaar_supplier_product_links l JOIN public.bazaar_product_variants v ON v.id = l.variant_id
                   WHERE l.product_id = NEW.id AND l.review_status = 'approved' AND l.sync_status = 'ok' AND v.is_active IS TRUE) THEN
      RAISE EXCEPTION 'Supplier products need at least one approved, verified, active option';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.bazaar_guard_link_verified()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $function$
BEGIN
  IF NEW.sync_status = 'ok' AND (
       NEW.below_floor IS NOT FALSE
    OR NEW.margin_cents IS NULL OR NEW.margin_cents < 200
    OR NEW.supplier_stock IS NULL OR NEW.supplier_stock <= 0
    OR NEW.computed_price_cents IS NULL OR NEW.supplier_cost_cents IS NULL
    OR NEW.last_synced_at IS NULL) THEN
    RAISE EXCEPTION 'An option can only be verified with stock, a confirmed price and at least $2.00 net profit';
  END IF;
  RETURN NEW;
END $function$;
REVOKE EXECUTE ON FUNCTION public.bazaar_guard_link_verified() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS bazaar_spl_guard_verified ON public.bazaar_supplier_product_links;
CREATE TRIGGER bazaar_spl_guard_verified BEFORE INSERT OR UPDATE ON public.bazaar_supplier_product_links
FOR EACH ROW EXECUTE FUNCTION public.bazaar_guard_link_verified();