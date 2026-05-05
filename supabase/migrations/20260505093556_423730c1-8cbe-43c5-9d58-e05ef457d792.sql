
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS interests text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.ai_hype_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  category text,
  image_url text,
  source text NOT NULL DEFAULT 'auto',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_hype_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "AI hype viewable by all"
ON public.ai_hype_posts FOR SELECT USING (true);

CREATE POLICY "Admins create AI hype"
ON public.ai_hype_posts FOR INSERT
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE POLICY "Admins delete AI hype"
ON public.ai_hype_posts FOR DELETE
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE INDEX IF NOT EXISTS idx_ai_hype_created ON public.ai_hype_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_interests ON public.profiles USING GIN(interests);
