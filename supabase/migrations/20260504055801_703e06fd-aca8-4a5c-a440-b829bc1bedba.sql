
CREATE OR REPLACE FUNCTION public.generate_public_id()
RETURNS text LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v text;
BEGIN
  LOOP
    v := upper(substr(md5(gen_random_uuid()::text), 1, 8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE public_id = v);
  END LOOP;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_public_id()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.public_id IS NULL THEN
    NEW.public_id := public.generate_public_id();
  END IF;
  RETURN NEW;
END;
$$;
