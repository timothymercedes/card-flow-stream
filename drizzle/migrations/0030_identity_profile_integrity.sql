ALTER TABLE public.username_history
  ADD COLUMN IF NOT EXISTS changed_by uuid,
  ADD COLUMN IF NOT EXISTS initiator_type text NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS investigation_ref uuid;
CREATE INDEX IF NOT EXISTS idx_username_history_old ON public.username_history (lower(old_username));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS show_followers_list boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_following_list boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS original_username_assigned_at timestamptz;
UPDATE public.profiles SET original_username_assigned_at = created_at WHERE original_username_assigned_at IS NULL;

CREATE TABLE public.account_investigations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active',
  reason text NOT NULL,
  opened_by uuid,
  restriction_start timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  closed_by uuid,
  closing_notes text,
  earliest_permitted_change_at timestamptz,
  override_by uuid,
  override_reason text,
  override_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_account_investigations_user ON public.account_investigations(user_id, status);
GRANT SELECT, INSERT, UPDATE ON public.account_investigations TO authenticated;
GRANT ALL ON public.account_investigations TO service_role;
ALTER TABLE public.account_investigations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read investigations" ON public.account_investigations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));
CREATE POLICY "Staff open investigations" ON public.account_investigations FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));
CREATE POLICY "Staff update investigations" ON public.account_investigations FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE OR REPLACE FUNCTION public.account_investigations_before()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status NOT IN ('active','closed') THEN RAISE EXCEPTION 'Invalid investigation status'; END IF;
  IF NEW.status = 'closed' AND (TG_OP = 'INSERT' OR OLD.status = 'active') THEN
    NEW.closed_at := COALESCE(NEW.closed_at, now());
    NEW.closed_by := COALESCE(NEW.closed_by, auth.uid());
    NEW.earliest_permitted_change_at := COALESCE(NEW.earliest_permitted_change_at, NEW.closed_at + interval '60 days');
  END IF;
  IF TG_OP = 'INSERT' THEN NEW.opened_by := COALESCE(NEW.opened_by, auth.uid()); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_account_investigations_before BEFORE INSERT OR UPDATE ON public.account_investigations
  FOR EACH ROW EXECUTE FUNCTION public.account_investigations_before();

CREATE OR REPLACE FUNCTION public.username_change_eligibility(_user_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN auth.uid() IS DISTINCT FROM _user_id AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
      THEN jsonb_build_object('allowed', false, 'reason', 'forbidden')
    WHEN EXISTS (SELECT 1 FROM account_investigations WHERE user_id=_user_id AND status='active' AND override_at IS NULL)
      THEN jsonb_build_object('allowed', false, 'reason', 'under_review')
    ELSE COALESCE((
      SELECT jsonb_build_object('allowed', false, 'reason', 'cooldown', 'available_at', max(earliest_permitted_change_at))
      FROM account_investigations
      WHERE user_id=_user_id AND status='closed' AND override_at IS NULL AND earliest_permitted_change_at > now()
      HAVING count(*) > 0), jsonb_build_object('allowed', true))
  END
$$;
GRANT EXECUTE ON FUNCTION public.username_change_eligibility(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.check_username_change_eligibility()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _elig jsonb;
BEGIN
  IF NEW.username IS NOT DISTINCT FROM OLD.username OR NEW.username IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM username_history h WHERE lower(h.old_username)=lower(NEW.username) AND h.user_id <> NEW.id) THEN
    RAISE EXCEPTION 'This username belonged to another member and cannot be claimed' USING ERRCODE='P0001';
  END IF;
  IF auth.uid() IS NULL OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') THEN RETURN NEW; END IF;
  _elig := public.username_change_eligibility(NEW.id);
  IF NOT (_elig->>'allowed')::boolean THEN
    RAISE EXCEPTION 'Username changes are temporarily locked for this account (%).', _elig->>'reason' USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_profiles_username_eligibility BEFORE UPDATE OF username ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.check_username_change_eligibility();

CREATE OR REPLACE FUNCTION public.track_profile_history()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _init text;
BEGIN
  IF NEW.shop_name IS DISTINCT FROM OLD.shop_name THEN
    INSERT INTO public.store_name_history(seller_id, old_name, new_name, changed_by)
      VALUES (NEW.id, OLD.shop_name, NEW.shop_name, auth.uid());
    PERFORM public.log_account_event(NEW.id, 'store_name_changed',
      COALESCE('Store renamed from "' || OLD.shop_name || '" to "' || NEW.shop_name || '"',
               'Store name set to "' || COALESCE(NEW.shop_name,'') || '"'),
      'medium', jsonb_build_object('old', OLD.shop_name, 'new', NEW.shop_name), auth.uid());
  END IF;
  IF NEW.username IS DISTINCT FROM OLD.username THEN
    _init := CASE WHEN auth.uid() IS NULL THEN 'system' WHEN auth.uid() = NEW.id THEN 'user' ELSE 'admin' END;
    INSERT INTO public.username_history(user_id, old_username, new_username, changed_by, initiator_type)
      VALUES (NEW.id, OLD.username, NEW.username, auth.uid(), _init);
    PERFORM public.log_account_event(NEW.id, 'username_changed',
      'Username changed from @' || OLD.username || ' to @' || NEW.username,
      'medium', jsonb_build_object('old', OLD.username, 'new', NEW.username, 'initiator', _init), auth.uid());
  END IF;
  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
    PERFORM public.log_account_event(NEW.id, 'verification_status_changed',
      'Verification: ' || OLD.verification_status || ' → ' || NEW.verification_status,
      'medium', jsonb_build_object('old', OLD.verification_status, 'new', NEW.verification_status), auth.uid());
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.resolve_former_username(_username text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.username FROM username_history h JOIN profiles p ON p.id = h.user_id
  WHERE lower(h.old_username) = lower(_username) AND p.username IS NOT NULL
  ORDER BY h.changed_at DESC LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.resolve_former_username(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.follow_list_visibility(_user_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('followers', show_followers_list OR auth.uid() = id, 'following', show_following_list OR auth.uid() = id)
  FROM profiles WHERE id = _user_id
$$;
GRANT EXECUTE ON FUNCTION public.follow_list_visibility(uuid) TO anon, authenticated;