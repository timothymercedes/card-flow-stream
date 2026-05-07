
-- 1. Fix post_reactions check constraint (was only allowing like/dislike)
ALTER TABLE public.post_reactions DROP CONSTRAINT IF EXISTS post_reactions_reaction_check;
ALTER TABLE public.post_reactions ADD CONSTRAINT post_reactions_reaction_check
  CHECK (reaction IN ('like','dislike','love','fire','laugh','wow','clap','money'));

-- 2. Story reactions
CREATE TABLE IF NOT EXISTS public.story_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  reaction text NOT NULL CHECK (reaction IN ('like','love','fire','laugh','wow','clap','money')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (story_id, user_id)
);

ALTER TABLE public.story_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Story reactions viewable by all" ON public.story_reactions
  FOR SELECT USING (true);
CREATE POLICY "Auth users react to stories" ON public.story_reactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own story reaction" ON public.story_reactions
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own story reaction" ON public.story_reactions
  FOR DELETE USING (auth.uid() = user_id);

-- 3. Moderation on stories
ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS moderation_reason text,
  ADD COLUMN IF NOT EXISTS moderation_category text;

CREATE INDEX IF NOT EXISTS stories_user_id_idx ON public.stories(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS posts_user_id_idx ON public.posts(user_id, created_at DESC);
