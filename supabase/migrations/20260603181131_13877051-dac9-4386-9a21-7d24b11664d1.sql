-- ===== Arena cosmetics ownership =====
CREATE TABLE public.arena_user_cosmetics (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cosmetic_key text NOT NULL,
  cosmetic_type text NOT NULL,
  equipped boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, cosmetic_key)
);
CREATE INDEX idx_arena_user_cosmetics_user ON public.arena_user_cosmetics (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.arena_user_cosmetics TO authenticated;
GRANT ALL ON public.arena_user_cosmetics TO service_role;

ALTER TABLE public.arena_user_cosmetics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cosmetics self read" ON public.arena_user_cosmetics
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Cosmetics self update" ON public.arena_user_cosmetics
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ===== Arena daily challenge claims =====
CREATE TABLE public.arena_daily_claims (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_date date NOT NULL DEFAULT CURRENT_DATE,
  challenge_key text NOT NULL,
  reward_xp integer NOT NULL DEFAULT 0,
  reward_credits integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, challenge_date, challenge_key)
);
CREATE INDEX idx_arena_daily_claims_user ON public.arena_daily_claims (user_id, challenge_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.arena_daily_claims TO authenticated;
GRANT ALL ON public.arena_daily_claims TO service_role;

ALTER TABLE public.arena_daily_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Daily claims self read" ON public.arena_daily_claims
  FOR SELECT TO authenticated USING (auth.uid() = user_id);