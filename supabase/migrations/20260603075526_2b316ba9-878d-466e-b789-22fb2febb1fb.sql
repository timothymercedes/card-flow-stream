CREATE TABLE public.arena_badges (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  badge_key text NOT NULL,
  earned_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, badge_key)
);

GRANT SELECT ON public.arena_badges TO authenticated;
GRANT SELECT ON public.arena_badges TO anon;
GRANT ALL ON public.arena_badges TO service_role;

ALTER TABLE public.arena_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Arena badges viewable by all"
ON public.arena_badges FOR SELECT
USING (true);

CREATE INDEX idx_arena_badges_user ON public.arena_badges (user_id);