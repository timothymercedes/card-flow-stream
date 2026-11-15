CREATE OR REPLACE FUNCTION public.bazaar_block_demo_publish()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'published' AND EXISTS (
    SELECT 1 FROM public.bazaar_supplier_product_links l JOIN public.bazaar_suppliers s ON s.id = l.supplier_id
    WHERE l.product_id = NEW.id AND (s.is_demo OR l.review_status <> 'approved')) THEN
    RAISE EXCEPTION 'Supplier products must be admin-approved and cannot be demo items';
  END IF;
  RETURN NEW;
END $function$;
