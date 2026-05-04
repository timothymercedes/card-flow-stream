
-- Public unique id for users
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS public_id text UNIQUE;

CREATE OR REPLACE FUNCTION public.generate_public_id()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v text;
BEGIN
  LOOP
    v := upper(substr(md5(gen_random_uuid()::text), 1, 8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE public_id = v);
  END LOOP;
  RETURN v;
END;
$$;

UPDATE public.profiles SET public_id = public.generate_public_id() WHERE public_id IS NULL;

CREATE OR REPLACE FUNCTION public.set_public_id()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.public_id IS NULL THEN
    NEW.public_id := public.generate_public_id();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_set_public_id ON public.profiles;
CREATE TRIGGER profiles_set_public_id BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_public_id();

-- Roles
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

DROP POLICY IF EXISTS "Users view own roles" ON public.user_roles;
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admin can view ID documents and full profile fields (profiles select is already public)

-- Commission rate column on orders for snapshot
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS commission_rate numeric NOT NULL DEFAULT 0.05;
