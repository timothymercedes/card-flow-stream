CREATE OR REPLACE FUNCTION public.bazaar_touch()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  IF TG_TABLE_NAME = 'bazaar_products' THEN
    IF NEW.status = 'published' AND NEW.published_at IS NULL THEN NEW.published_at := now(); END IF;
  END IF;
  RETURN NEW;
END $function$;

-- Guests could not read ANY storage object because this policy called a function they cannot execute.
DROP POLICY "Vault images respect vault visibility" ON storage.objects;
CREATE POLICY "Vault images respect vault visibility" ON storage.objects FOR SELECT TO authenticated
USING ((bucket_id = 'vault-images') AND (((storage.foldername(name))[1] = (auth.uid())::text) OR public.can_view_vault_owner(((storage.foldername(name))[1])::uuid, auth.uid())));