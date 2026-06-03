CREATE TABLE public.arena_set_rewards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  set_key TEXT NOT NULL,
  set_name TEXT NOT NULL,
  category TEXT NOT NULL,
  reward_xp INTEGER NOT NULL DEFAULT 0,
  reward_credits INTEGER NOT NULL DEFAULT 0,
  claimed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, set_key)
);

GRANT SELECT, INSERT ON public.arena_set_rewards TO authenticated;
GRANT ALL ON public.arena_set_rewards TO service_role;

ALTER TABLE public.arena_set_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own set rewards"
ON public.arena_set_rewards FOR SELECT
USING (auth.uid() = user_id);

CREATE INDEX idx_arena_set_rewards_user ON public.arena_set_rewards (user_id);