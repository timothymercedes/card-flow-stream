-- UNAPPLIED: requires separate approval before any shared database change.
-- Preserve achievement uniqueness and existing permissions; use the existing
-- service-only, recipient-scoped reward writer instead of a nonexistent overload.
CREATE OR REPLACE FUNCTION public.unlock_achievement(_user_id uuid, _slug text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _ach_id uuid;
  _xp int;
  _inserted boolean := false;
BEGIN
  SELECT id, xp_reward INTO _ach_id, _xp FROM public.achievements WHERE slug = _slug;
  IF _ach_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.user_achievements (user_id, achievement_id)
  VALUES (_user_id, _ach_id)
  ON CONFLICT (user_id, achievement_id) DO NOTHING
  RETURNING true INTO _inserted;
  IF _inserted AND _xp > 0 THEN
    PERFORM public.grant_user_xp(_user_id, _xp, 'achievement:' || _slug, _ach_id::text);
  END IF;
END;
$$;