-- ===== PullBid Arena (Phase 4) =====
-- Digital companion battle game. Real cards are NEVER at risk.

CREATE OR REPLACE FUNCTION public.arena_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TYPE public.arena_title AS ENUM ('rookie','veteran','elite','champion','legend');

CREATE TABLE public.arena_seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.arena_seasons TO anon, authenticated;
GRANT ALL ON public.arena_seasons TO service_role;
ALTER TABLE public.arena_seasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Seasons are viewable by everyone" ON public.arena_seasons FOR SELECT USING (true);
INSERT INTO public.arena_seasons (name, active) VALUES ('Season 1', true);

CREATE TABLE public.arena_companions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  vault_card_id uuid NOT NULL,
  name text NOT NULL,
  category text,
  community text NOT NULL DEFAULT 'general',
  image_url text,
  level integer NOT NULL DEFAULT 1,
  xp integer NOT NULL DEFAULT 0,
  attack integer NOT NULL DEFAULT 10,
  defense integer NOT NULL DEFAULT 10,
  speed integer NOT NULL DEFAULT 10,
  hidden_traits jsonb NOT NULL DEFAULT '[]'::jsonb,
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  win_streak integer NOT NULL DEFAULT 0,
  longest_win_streak integer NOT NULL DEFAULT 0,
  season_wins integer NOT NULL DEFAULT 0,
  trophies integer NOT NULL DEFAULT 0,
  arena_rank integer NOT NULL DEFAULT 1000,
  title public.arena_title NOT NULL DEFAULT 'rookie',
  cosmetics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, vault_card_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.arena_companions TO authenticated;
GRANT ALL ON public.arena_companions TO service_role;
ALTER TABLE public.arena_companions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage own companions" ON public.arena_companions
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_arena_companions_user ON public.arena_companions(user_id);
CREATE INDEX idx_arena_companions_wins ON public.arena_companions(wins DESC);
CREATE INDEX idx_arena_companions_streak ON public.arena_companions(longest_win_streak DESC);
CREATE INDEX idx_arena_companions_community ON public.arena_companions(community);

CREATE TABLE public.arena_battles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_id uuid NOT NULL,
  opponent_id uuid NOT NULL,
  challenger_companion_id uuid NOT NULL,
  opponent_companion_id uuid NOT NULL,
  winner_companion_id uuid,
  status text NOT NULL DEFAULT 'resolved',
  log jsonb NOT NULL DEFAULT '[]'::jsonb,
  season_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.arena_battles TO authenticated;
GRANT ALL ON public.arena_battles TO service_role;
ALTER TABLE public.arena_battles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants can view their battles" ON public.arena_battles
  FOR SELECT TO authenticated USING (auth.uid() = challenger_id OR auth.uid() = opponent_id);
CREATE INDEX idx_arena_battles_challenger ON public.arena_battles(challenger_id);
CREATE INDEX idx_arena_battles_opponent ON public.arena_battles(opponent_id);

CREATE TRIGGER update_arena_companions_updated_at
  BEFORE UPDATE ON public.arena_companions
  FOR EACH ROW EXECUTE FUNCTION public.arena_set_updated_at();

CREATE VIEW public.arena_companions_public
WITH (security_invoker = false) AS
  SELECT id, user_id, name, category, community, image_url,
         wins, losses,
         CASE WHEN (wins + losses) > 0
              THEN round((wins::numeric / (wins + losses)) * 100, 1)
              ELSE 0 END AS win_rate,
         title, trophies, arena_rank, longest_win_streak
  FROM public.arena_companions;
GRANT SELECT ON public.arena_companions_public TO anon, authenticated;
