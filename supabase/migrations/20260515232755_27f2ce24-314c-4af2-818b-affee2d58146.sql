-- Seed new achievements (idempotent)
INSERT INTO public.achievements (slug, title, description, icon, xp_reward, category)
VALUES
  ('combo_5', 'Combo Starter', 'Hit a 5x bid combo streak', 'flame', 50, 'engagement'),
  ('combo_10', 'Combo Pro', 'Hit a 10x bid combo streak', 'flame', 150, 'engagement'),
  ('combo_25', 'Combo Legend', 'Hit a 25x bid combo streak', 'flame', 500, 'engagement'),
  ('ship_first', 'First Package Out', 'Scan your first package for shipping', 'package', 50, 'seller'),
  ('ship_10', 'Shipping Apprentice', 'Pack 10 orders', 'package', 150, 'seller'),
  ('ship_50', 'Shipping Pro', 'Pack 50 orders', 'truck', 400, 'seller'),
  ('ship_250', 'Logistics Legend', 'Pack 250 orders', 'truck', 1500, 'seller'),
  ('live_supporter', 'Live Supporter', 'Get notified and join a favorite seller live', 'bell', 25, 'social')
ON CONFLICT (slug) DO NOTHING;

-- Helper: unlock an achievement (idempotent) and award its XP
CREATE OR REPLACE FUNCTION public.unlock_achievement(_user_id uuid, _slug text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ach_id uuid;
  _xp int;
  _inserted boolean := false;
BEGIN
  SELECT id, xp_reward INTO _ach_id, _xp
  FROM public.achievements WHERE slug = _slug;
  IF _ach_id IS NULL THEN RETURN; END IF;

  INSERT INTO public.user_achievements (user_id, achievement_id)
  VALUES (_user_id, _ach_id)
  ON CONFLICT (user_id, achievement_id) DO NOTHING
  RETURNING true INTO _inserted;

  IF _inserted AND _xp > 0 THEN
    PERFORM public.award_xp(_user_id, _xp, 'achievement:' || _slug, _ach_id);
  END IF;
END;
$$;

-- Trigger: combo streak achievements
CREATE OR REPLACE FUNCTION public.check_combo_achievements()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.current_streak >= 5 THEN PERFORM public.unlock_achievement(NEW.user_id, 'combo_5'); END IF;
  IF NEW.current_streak >= 10 THEN PERFORM public.unlock_achievement(NEW.user_id, 'combo_10'); END IF;
  IF NEW.current_streak >= 25 THEN PERFORM public.unlock_achievement(NEW.user_id, 'combo_25'); END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_combo_achievements ON public.user_combo_streaks;
CREATE TRIGGER trg_combo_achievements
AFTER INSERT OR UPDATE ON public.user_combo_streaks
FOR EACH ROW EXECUTE FUNCTION public.check_combo_achievements();

-- Trigger: shipping achievements based on lifetime packed scans
CREATE OR REPLACE FUNCTION public.check_shipping_achievements()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count int;
BEGIN
  IF NEW.scan_type IS DISTINCT FROM 'packed' THEN RETURN NEW; END IF;

  SELECT count(*) INTO _count
  FROM public.shipping_scans
  WHERE seller_id = NEW.seller_id AND scan_type = 'packed';

  IF _count >= 1 THEN PERFORM public.unlock_achievement(NEW.seller_id, 'ship_first'); END IF;
  IF _count >= 10 THEN PERFORM public.unlock_achievement(NEW.seller_id, 'ship_10'); END IF;
  IF _count >= 50 THEN PERFORM public.unlock_achievement(NEW.seller_id, 'ship_50'); END IF;
  IF _count >= 250 THEN PERFORM public.unlock_achievement(NEW.seller_id, 'ship_250'); END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shipping_achievements ON public.shipping_scans;
CREATE TRIGGER trg_shipping_achievements
AFTER INSERT ON public.shipping_scans
FOR EACH ROW EXECUTE FUNCTION public.check_shipping_achievements();