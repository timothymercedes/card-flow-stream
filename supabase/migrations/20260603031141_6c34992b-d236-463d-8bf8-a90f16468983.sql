-- =========================================================
-- PRIORITY 6: DAILY CRATES (digital cosmetic rewards only)
-- =========================================================

-- 1. crate_rewards catalog --------------------------------------------
CREATE TABLE public.crate_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'badge', -- xp | title | badge | frame | theme
  rarity TEXT NOT NULL DEFAULT 'common', -- common | rare | epic | legendary
  value TEXT, -- title text, theme gradient classes, frame id, etc.
  icon TEXT NOT NULL DEFAULT 'gift',
  xp_bonus INT NOT NULL DEFAULT 0,
  weight INT NOT NULL DEFAULT 100, -- relative drop weight
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.crate_rewards TO anon, authenticated;
GRANT ALL ON public.crate_rewards TO service_role;
ALTER TABLE public.crate_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crate rewards public read" ON public.crate_rewards
  FOR SELECT USING (true);

-- 2. user_rewards (owned cosmetics) -----------------------------------
CREATE TABLE public.user_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reward_slug TEXT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  obtained_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, reward_slug)
);
CREATE INDEX idx_user_rewards_user ON public.user_rewards(user_id, obtained_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_rewards TO authenticated;
GRANT ALL ON public.user_rewards TO service_role;
ALTER TABLE public.user_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user rewards self read" ON public.user_rewards
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user rewards public read" ON public.user_rewards
  FOR SELECT USING (true); -- so profiles can show others' cosmetics

-- 3. user_crate_state (one daily crate per user) ----------------------
CREATE TABLE public.user_crate_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_opened_date DATE,
  total_opened INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_crate_state TO authenticated;
GRANT ALL ON public.user_crate_state TO service_role;
ALTER TABLE public.user_crate_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crate state self read" ON public.user_crate_state
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- =========================================================
-- open_daily_crate RPC — idempotent per calendar day,
-- weighted-random reward, grants cosmetic + bonus XP.
-- =========================================================
CREATE OR REPLACE FUNCTION public.open_daily_crate()
RETURNS TABLE (
  reward_slug TEXT,
  reward_name TEXT,
  kind TEXT,
  rarity TEXT,
  value TEXT,
  icon TEXT,
  xp_bonus INT,
  already_opened BOOLEAN,
  is_new BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  last_date DATE;
  total_w BIGINT;
  pick BIGINT;
  chosen RECORD;
  newly BOOLEAN := false;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT last_opened_date INTO last_date FROM public.user_crate_state WHERE user_id = uid;

  IF last_date = CURRENT_DATE THEN
    RETURN QUERY SELECT NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, 0, true, false;
    RETURN;
  END IF;

  SELECT COALESCE(SUM(weight), 0) INTO total_w FROM public.crate_rewards WHERE is_active;
  IF total_w = 0 THEN RAISE EXCEPTION 'No rewards configured'; END IF;

  pick := floor(random() * total_w)::bigint;
  FOR chosen IN
    SELECT * FROM public.crate_rewards WHERE is_active ORDER BY created_at
  LOOP
    IF pick < chosen.weight THEN EXIT; END IF;
    pick := pick - chosen.weight;
  END LOOP;

  -- record crate open
  INSERT INTO public.user_crate_state (user_id, last_opened_date, total_opened)
  VALUES (uid, CURRENT_DATE, 1)
  ON CONFLICT (user_id) DO UPDATE
    SET last_opened_date = CURRENT_DATE,
        total_opened = public.user_crate_state.total_opened + 1,
        updated_at = now();

  -- grant the cosmetic (track new vs duplicate)
  IF chosen.kind <> 'xp' THEN
    INSERT INTO public.user_rewards (user_id, reward_slug, quantity)
    VALUES (uid, chosen.slug, 1)
    ON CONFLICT (user_id, reward_slug) DO UPDATE
      SET quantity = public.user_rewards.quantity + 1;
    GET DIAGNOSTICS newly = ROW_COUNT;
    -- determine if this was the first time owning it
    SELECT (quantity = 1) INTO newly FROM public.user_rewards
      WHERE user_id = uid AND reward_slug = chosen.slug;
  END IF;

  -- award bonus XP (always at least a small base for opening)
  PERFORM public.award_xp(GREATEST(10, chosen.xp_bonus), 'crate:' || chosen.slug, CURRENT_DATE::text);

  RETURN QUERY SELECT chosen.slug, chosen.name, chosen.kind, chosen.rarity,
                      chosen.value, chosen.icon, GREATEST(10, chosen.xp_bonus), false, newly;
END;
$$;
GRANT EXECUTE ON FUNCTION public.open_daily_crate() TO authenticated;

-- =========================================================
-- Seed crate rewards (cosmetic / digital only)
-- =========================================================
INSERT INTO public.crate_rewards (slug, name, kind, rarity, value, icon, xp_bonus, weight) VALUES
  ('xp_small',       '+25 XP Boost',        'xp',    'common',    NULL,                              'zap',      25,  300),
  ('xp_medium',      '+75 XP Boost',        'xp',    'rare',      NULL,                              'zap',      75,  120),
  ('xp_large',       '+200 XP Boost',       'xp',    'epic',      NULL,                              'zap',      200, 40),
  ('badge_collector','Collector Badge',     'badge', 'common',    'collector',                       'package',  10,  200),
  ('badge_hunter',   'Card Hunter Badge',   'badge', 'rare',      'hunter',                          'crosshair',20,  100),
  ('badge_legend',   'Vault Legend Badge',  'badge', 'legendary', 'legend',                          'crown',    50,  15),
  ('title_rookie',   'Title: Rookie Pull',  'title', 'common',    'Rookie Pull',                     'tag',      10,  180),
  ('title_sharp',    'Title: Sharp Trader', 'title', 'rare',      'Sharp Trader',                    'tag',      25,  90),
  ('title_whale',    'Title: Vault Whale',  'title', 'epic',      'Vault Whale',                     'tag',      40,  35),
  ('frame_gold',     'Gold Card Frame',     'frame', 'epic',      'ring-4 ring-amber-400',           'square',   30,  40),
  ('frame_neon',     'Neon Card Frame',     'frame', 'rare',      'ring-4 ring-fuchsia-500',         'square',   20,  80),
  ('theme_sunset',   'Sunset Theme',        'theme', 'rare',      'from-amber-500 to-fuchsia-600',   'palette',  20,  70),
  ('theme_aurora',   'Aurora Theme',        'theme', 'epic',      'from-emerald-500 to-indigo-600',  'palette',  30,  30)
ON CONFLICT (slug) DO NOTHING;