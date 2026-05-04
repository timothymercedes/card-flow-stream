
-- Only one owner allowed
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_one_owner
  ON public.user_roles ((role)) WHERE role = 'owner';

-- Protect owner from suspension/ban
CREATE OR REPLACE FUNCTION public.prevent_owner_suspension()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.user_id AND role = 'owner') THEN
    RAISE EXCEPTION 'The owner cannot be suspended or banned';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_prevent_owner_suspension ON public.user_suspensions;
CREATE TRIGGER trg_prevent_owner_suspension
  BEFORE INSERT OR UPDATE ON public.user_suspensions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_owner_suspension();

-- Protect owner role from being removed/changed
CREATE OR REPLACE FUNCTION public.protect_owner_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.role = 'owner' THEN
    RAISE EXCEPTION 'Owner role cannot be removed';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.role = 'owner' AND NEW.role <> 'owner' THEN
    RAISE EXCEPTION 'Owner role cannot be changed';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_protect_owner_role ON public.user_roles;
CREATE TRIGGER trg_protect_owner_role
  BEFORE UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.protect_owner_role();

-- Promote existing admin user to owner
INSERT INTO public.user_roles (user_id, role)
VALUES ('cebe3c3a-e2ec-4e1f-810d-da8b011da8f6', 'owner')
ON CONFLICT (user_id, role) DO NOTHING;

-- Auto-follow owner on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _owner uuid;
BEGIN
  INSERT INTO public.profiles (id, username, is_seller)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data->>'is_seller')::boolean, false)
  );
  SELECT user_id INTO _owner FROM public.user_roles WHERE role = 'owner' LIMIT 1;
  IF _owner IS NOT NULL AND _owner <> NEW.id THEN
    INSERT INTO public.follows (follower_id, followee_id) VALUES (NEW.id, _owner)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Backfill follows
INSERT INTO public.follows (follower_id, followee_id)
SELECT p.id, ur.user_id FROM public.profiles p, public.user_roles ur
WHERE ur.role = 'owner' AND p.id <> ur.user_id
ON CONFLICT DO NOTHING;

-- Role management RPCs
CREATE OR REPLACE FUNCTION public.admin_assign_role(_target_user uuid, _role app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _caller uuid := auth.uid();
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _role = 'owner' THEN RAISE EXCEPTION 'Owner cannot be assigned'; END IF;
  IF public.has_role(_caller, 'owner') THEN
    NULL;
  ELSIF public.has_role(_caller, 'admin') THEN
    IF _role = 'admin' THEN RAISE EXCEPTION 'Only the owner can grant admin'; END IF;
  ELSE
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  IF public.has_role(_target_user, 'owner') THEN
    RAISE EXCEPTION 'Cannot modify owner roles';
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_target_user, _role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_remove_role(_target_user uuid, _role app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _caller uuid := auth.uid();
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _role = 'owner' THEN RAISE EXCEPTION 'Owner role cannot be removed'; END IF;
  IF public.has_role(_caller, 'owner') THEN
    NULL;
  ELSIF public.has_role(_caller, 'admin') THEN
    IF _role = 'admin' THEN RAISE EXCEPTION 'Only the owner can remove admin'; END IF;
  ELSE
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  DELETE FROM public.user_roles WHERE user_id = _target_user AND role = _role;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_assign_role(uuid, app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_remove_role(uuid, app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_assign_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_remove_role(uuid, app_role) TO authenticated;

-- Allow owner/admin to view all roles
DROP POLICY IF EXISTS "Privileged view all roles" ON public.user_roles;
CREATE POLICY "Privileged view all roles" ON public.user_roles
  FOR SELECT USING (
    public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin')
  );
