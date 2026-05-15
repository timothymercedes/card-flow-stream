ALTER TABLE public.story_reactions DROP CONSTRAINT IF EXISTS story_reactions_reaction_check;
ALTER TABLE public.story_reactions ADD CONSTRAINT story_reactions_reaction_check
  CHECK (reaction = ANY (ARRAY['like','love','fire','laugh','wow','clap','money','eyes']));
CREATE INDEX IF NOT EXISTS idx_story_reactions_story ON public.story_reactions(story_id);
CREATE INDEX IF NOT EXISTS idx_story_views_story ON public.story_views(story_id);