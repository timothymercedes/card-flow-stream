
-- =========================================================
-- GAMIFICATION FOUNDATION
-- =========================================================

-- 1. user_progression -------------------------------------------------
CREATE TABLE public.user_progression (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  xp BIGINT NOT NULL DEFAULT 0,
  lifetime_xp BIGINT NOT NULL DEFAULT 0,
  level INT NOT NULL DEFAULT 1,
  login_streak INT NOT NULL DEFAULT 0,
  longest_login_streak INT NOT NULL DEFAULT 0,
  watch_streak INT NOT NULL DEFAULT 0,
  last_login_date DATE,
  last_watch_date DATE,
  total_bids INT NOT NULL DEFAULT 0,
  total_wins INT NOT NULL DEFAULT 0,
  total_sales INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_progression ENABLE ROW LEVEL SECURITY;
CREATE POLICY "progression self read" ON public.user_progression
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "progression public read level" ON public.user_progression
  FOR SELECT TO anon USING (false);

-- 2. achievements catalog ---------------------------------------------
CREATE TABLE public.achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'trophy',
  category TEXT NOT NULL DEFAULT 'general',
  xp_reward INT NOT NULL DEFAULT 50,
  threshold INT,
  is_secret BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "achievements public read" ON public.achievements
  FOR SELECT USING (true);

-- 3. user_achievements ------------------------------------------------
CREATE TABLE public.user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, achievement_id)
);
CREATE INDEX idx_user_ach_user ON public.user_achievements(user_id, unlocked_at DESC);
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user achievements self read" ON public.user_achievements
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user achievements public read" ON public.user_achievements
  FOR SELECT USING (true); -- so profiles can show others' badges

-- 4. daily_quests catalog ---------------------------------------------
CREATE TABLE public.daily_quests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  xp_reward INT NOT NULL DEFAULT 25,
  target INT NOT NULL DEFAULT 1,
  kind TEXT NOT NULL DEFAULT 'daily', -- daily | weekly
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.daily_quests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quests public read" ON public.daily_quests
  FOR SELECT USING (true);

-- 5. user_quest_progress ----------------------------------------------
CREATE TABLE public.user_quest_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quest_slug TEXT NOT NULL,
  period_key TEXT NOT NULL, -- e.g. '2026-05-15' for daily, '2026-W20' for weekly
  progress INT NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, quest_slug, period_key)
);
CREATE INDEX idx_quest_prog_user ON public.user_quest_progress(user_id, period_key);
ALTER TABLE public.user_quest_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quest progress self read" ON public.user_quest_progress
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 6. xp_events audit --------------------------------------------------
CREATE TABLE public.xp_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INT NOT NULL,
  reason TEXT NOT NULL,
  ref_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_xp_events_user ON public.xp_events(user_id, created_at DESC);
ALTER TABLE public.xp_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "xp events self read" ON public.xp_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- =========================================================
-- LEVEL CURVE: level n requires (n*n*100) total xp
-- =========================================================
CREATE OR REPLACE FUNCTION public.xp_to_level(_xp BIGINT)
RETURNS INT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT GREATEST(1, FLOOR(SQRT(_xp::numeric / 100))::int + 1);
$$;

-- =========================================================
-- award_xp RPC
-- =========================================================
CREATE OR REPLACE FUNCTION public.award_xp(
  _amount INT,
  _reason TEXT,
  _ref_id TEXT DEFAULT NULL
)
RETURNS TABLE (new_xp BIGINT, new_level INT, leveled_up BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  prev_level INT;
  next_level INT;
  next_xp BIGINT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _amount IS NULL OR _amount = 0 THEN
    RAISE EXCEPTION 'Invalid xp amount';
  END IF;

  INSERT INTO public.user_progression (user_id, xp, lifetime_xp, level)
  VALUES (uid, GREATEST(0, _amount), GREATEST(0, _amount), 1)
  ON CONFLICT (user_id) DO UPDATE
    SET xp = GREATEST(0, public.user_progression.xp + _amount),
        lifetime_xp = public.user_progression.lifetime_xp + GREATEST(0, _amount),
        updated_at = now()
  RETURNING level, xp INTO prev_level, next_xp;

  next_level := public.xp_to_level(next_xp);
  IF next_level <> prev_level THEN
    UPDATE public.user_progression SET level = next_level WHERE user_id = uid;
  END IF;

  INSERT INTO public.xp_events (user_id, amount, reason, ref_id)
  VALUES (uid, _amount, _reason, _ref_id);

  RETURN QUERY SELECT next_xp, next_level, (next_level > prev_level);
END;
$$;
GRANT EXECUTE ON FUNCTION public.award_xp(INT, TEXT, TEXT) TO authenticated;

-- =========================================================
-- claim_daily_login RPC
-- =========================================================
CREATE OR REPLACE FUNCTION public.claim_daily_login()
RETURNS TABLE (streak INT, xp_awarded INT, already_claimed BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  prev_date DATE;
  prev_streak INT := 0;
  new_streak INT := 1;
  reward INT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT last_login_date, login_streak
    INTO prev_date, prev_streak
  FROM public.user_progression WHERE user_id = uid;

  IF prev_date = CURRENT_DATE THEN
    RETURN QUERY SELECT prev_streak, 0, true;
    RETURN;
  END IF;

  IF prev_date = CURRENT_DATE - INTERVAL '1 day' THEN
    new_streak := COALESCE(prev_streak, 0) + 1;
  ELSE
    new_streak := 1;
  END IF;

  -- reward grows with streak, caps at 200xp
  reward := LEAST(200, 25 + (new_streak * 10));

  INSERT INTO public.user_progression (user_id, last_login_date, login_streak, longest_login_streak)
  VALUES (uid, CURRENT_DATE, new_streak, new_streak)
  ON CONFLICT (user_id) DO UPDATE
    SET last_login_date = CURRENT_DATE,
        login_streak = new_streak,
        longest_login_streak = GREATEST(public.user_progression.longest_login_streak, new_streak),
        updated_at = now();

  PERFORM public.award_xp(reward, 'daily_login', new_streak::text);

  RETURN QUERY SELECT new_streak, reward, false;
END;
$$;
GRANT EXECUTE ON FUNCTION public.claim_daily_login() TO authenticated;

-- =========================================================
-- bump_quest_progress RPC
-- =========================================================
CREATE OR REPLACE FUNCTION public.bump_quest_progress(_slug TEXT, _delta INT DEFAULT 1)
RETURNS TABLE (progress INT, target INT, completed BOOLEAN, xp_awarded INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  q RECORD;
  pkey TEXT;
  row_id UUID;
  new_progress INT;
  was_complete BOOLEAN;
  awarded INT := 0;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO q FROM public.daily_quests WHERE slug = _slug AND is_active;
  IF q IS NULL THEN RETURN; END IF;

  pkey := CASE WHEN q.kind = 'weekly'
               THEN to_char(now(), 'IYYY"-W"IW')
               ELSE to_char(CURRENT_DATE, 'YYYY-MM-DD') END;

  INSERT INTO public.user_quest_progress (user_id, quest_slug, period_key, progress)
  VALUES (uid, _slug, pkey, GREATEST(0, _delta))
  ON CONFLICT (user_id, quest_slug, period_key) DO UPDATE
    SET progress = public.user_quest_progress.progress + _delta,
        updated_at = now()
  RETURNING id, progress, (completed_at IS NOT NULL) INTO row_id, new_progress, was_complete;

  IF NOT was_complete AND new_progress >= q.target THEN
    UPDATE public.user_quest_progress
       SET completed_at = now(), claimed_at = now()
     WHERE id = row_id;
    PERFORM public.award_xp(q.xp_reward, 'quest:' || _slug, pkey);
    awarded := q.xp_reward;
  END IF;

  RETURN QUERY SELECT new_progress, q.target, (new_progress >= q.target), awarded;
END;
$$;
GRANT EXECUTE ON FUNCTION public.bump_quest_progress(TEXT, INT) TO authenticated;

-- =========================================================
-- Seed achievements
-- =========================================================
INSERT INTO public.achievements (slug, title, description, icon, category, xp_reward, threshold, sort_order) VALUES
  ('first_bid',         'First Bid',           'Place your first live bid.',                'gavel',     'bidder',    50,  1,  10),
  ('bid_10',            'Hammer Time',         'Place 10 bids.',                            'gavel',     'bidder',    100, 10, 20),
  ('bid_100',           'Auction Addict',      'Place 100 bids.',                           'flame',     'bidder',    500, 100, 30),
  ('first_win',         'First Pull',          'Win your first auction.',                   'trophy',    'collector', 100, 1,  40),
  ('win_10',            'Vault Builder',       'Win 10 auctions.',                          'package',   'collector', 250, 10, 50),
  ('first_sale',        'Open for Business',   'Make your first sale.',                     'store',     'seller',    100, 1,  60),
  ('sale_25',           'Trusted Seller',      'Complete 25 sales.',                        'badge',     'seller',    500, 25, 70),
  ('streak_7',          'Week Warrior',        'Log in 7 days in a row.',                   'flame',     'streak',    200, 7,  80),
  ('streak_30',         'Hall of Famer',       'Log in 30 days in a row.',                  'crown',     'streak',    1000,30, 90),
  ('first_follow',      'New Friend',          'Follow your first seller.',                 'heart',     'social',    25,  1,  100),
  ('first_story',       'Show Off',            'Post your first story.',                    'sparkles',  'social',    50,  1,  110),
  ('level_10',          'Rising Star',         'Reach level 10.',                           'star',      'progress',  500, 10, 120)
ON CONFLICT (slug) DO NOTHING;

-- =========================================================
-- Seed daily quests
-- =========================================================
INSERT INTO public.daily_quests (slug, title, description, xp_reward, target, kind, sort_order) VALUES
  ('daily_login',     'Show up',          'Log in today.',                 25, 1, 'daily', 10),
  ('daily_watch',     'Catch a show',     'Watch a live stream.',          50, 1, 'daily', 20),
  ('daily_bid',       'Throw a bid',      'Place 3 bids.',                 75, 3, 'daily', 30),
  ('weekly_purchase', 'Pull of the week', 'Win or buy something.',        300, 1, 'weekly', 40)
ON CONFLICT (slug) DO NOTHING;
