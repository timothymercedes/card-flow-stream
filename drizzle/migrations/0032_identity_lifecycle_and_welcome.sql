CREATE OR REPLACE FUNCTION public.username_change_eligibility(_user_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN auth.uid() IS DISTINCT FROM _user_id AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
      THEN jsonb_build_object('allowed', false, 'reason', 'forbidden')
    WHEN EXISTS (SELECT 1 FROM account_investigations WHERE user_id=_user_id AND status='active' AND override_at IS NULL)
      THEN jsonb_build_object('allowed', false, 'reason', 'under_review')
    WHEN EXISTS (SELECT 1 FROM account_investigations WHERE user_id=_user_id AND override_at IS NULL AND created_at > now() - interval '60 days')
      OR EXISTS (SELECT 1 FROM moderation_reports WHERE subject_user_id=_user_id AND created_at > now() - interval '60 days')
      OR EXISTS (SELECT 1 FROM user_reports WHERE target_type IN ('user','store') AND target_id=_user_id AND created_at > now() - interval '60 days')
      THEN jsonb_build_object('allowed', false, 'reason', 'recent_report', 'available_at', (
        SELECT max(t) + interval '60 days' FROM (
          SELECT created_at t FROM account_investigations WHERE user_id=_user_id AND override_at IS NULL
          UNION ALL SELECT created_at FROM moderation_reports WHERE subject_user_id=_user_id
          UNION ALL SELECT created_at FROM user_reports WHERE target_type IN ('user','store') AND target_id=_user_id) x))
    ELSE COALESCE((
      SELECT jsonb_build_object('allowed', false, 'reason', 'cooldown', 'available_at', max(earliest_permitted_change_at))
      FROM account_investigations
      WHERE user_id=_user_id AND status='closed' AND override_at IS NULL AND earliest_permitted_change_at > now()
      HAVING count(*) > 0), jsonb_build_object('allowed', true))
  END
$$;

CREATE OR REPLACE FUNCTION public.check_username_change_eligibility()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _elig jsonb;
BEGIN
  IF NEW.username IS NOT DISTINCT FROM OLD.username OR NEW.username IS NULL THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') THEN RETURN NEW; END IF;
  _elig := public.username_change_eligibility(NEW.id);
  IF NOT (_elig->>'allowed')::boolean THEN
    RAISE EXCEPTION 'Name changes are locked for this account (%).', _elig->>'reason' USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.check_shop_name_change_eligibility()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _elig jsonb;
BEGIN
  IF NEW.shop_name IS NOT DISTINCT FROM OLD.shop_name OR OLD.shop_name IS NULL THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') THEN RETURN NEW; END IF;
  _elig := public.username_change_eligibility(NEW.id);
  IF NOT (_elig->>'allowed')::boolean THEN
    RAISE EXCEPTION 'Name changes are locked for this account (%).', _elig->>'reason' USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_profiles_shop_name_eligibility ON public.profiles;
CREATE TRIGGER trg_profiles_shop_name_eligibility BEFORE UPDATE OF shop_name ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.check_shop_name_change_eligibility();

CREATE OR REPLACE FUNCTION public.propagate_username_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.username IS DISTINCT FROM OLD.username AND NEW.username IS NOT NULL THEN
    UPDATE public.posts SET username = NEW.username WHERE user_id = NEW.id AND username IS DISTINCT FROM NEW.username;
    UPDATE public.post_comments SET username = NEW.username WHERE user_id = NEW.id AND username IS DISTINCT FROM NEW.username;
    UPDATE public.stories SET username = NEW.username WHERE user_id = NEW.id AND username IS DISTINCT FROM NEW.username;
    UPDATE public.chat_messages SET username = NEW.username WHERE user_id = NEW.id AND username IS DISTINCT FROM NEW.username;
    UPDATE public.direct_messages SET sender_username = NEW.username WHERE sender_id = NEW.id AND sender_username IS DISTINCT FROM NEW.username;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_profiles_propagate_username ON public.profiles;
CREATE TRIGGER trg_profiles_propagate_username AFTER UPDATE OF username ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.propagate_username_change();

CREATE OR REPLACE FUNCTION public.send_welcome_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, body, link)
  VALUES (NEW.id, 'welcome', 'Welcome to PullBid Live! 🎉 Your collector journey starts now — set up your profile, add your first item to your Vault, and catch a live show.', '/onboarding');
  RETURN NEW;
EXCEPTION WHEN others THEN RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_profiles_welcome ON public.profiles;
CREATE TRIGGER trg_profiles_welcome AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.send_welcome_notification();

UPDATE public.profiles p SET username = i.username
FROM public.personal_social_identities i
WHERE i.user_id = p.id AND i.username IS NOT NULL AND lower(i.username) <> lower(p.username)
  AND NOT EXISTS (SELECT 1 FROM public.profiles o WHERE lower(o.username) = lower(i.username) AND o.id <> p.id);