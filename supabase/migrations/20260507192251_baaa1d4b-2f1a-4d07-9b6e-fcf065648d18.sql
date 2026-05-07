DO $$ BEGIN
  CREATE TYPE public.tutorial_audience AS ENUM ('buyer','seller','host','flex','auction','general');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.tutorials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  audience public.tutorial_audience NOT NULL DEFAULT 'general',
  category TEXT NOT NULL DEFAULT 'getting-started',
  video_url TEXT NOT NULL,
  captions_url TEXT,
  thumbnail_url TEXT,
  duration_seconds INT,
  order_index INT NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tutorials_audience ON public.tutorials(audience, order_index);
ALTER TABLE public.tutorials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tutorials_read_published" ON public.tutorials;
CREATE POLICY "tutorials_read_published" ON public.tutorials
  FOR SELECT TO authenticated
  USING (is_published OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

DROP POLICY IF EXISTS "tutorials_admin_write" ON public.tutorials;
CREATE POLICY "tutorials_admin_write" ON public.tutorials
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

DROP TRIGGER IF EXISTS trg_tutorials_updated_at ON public.tutorials;
CREATE TRIGGER trg_tutorials_updated_at
  BEFORE UPDATE ON public.tutorials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.tutorial_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tutorial_id UUID NOT NULL REFERENCES public.tutorials(id) ON DELETE CASCADE,
  watched_seconds INT NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, tutorial_id)
);
CREATE INDEX IF NOT EXISTS idx_tut_prog_user ON public.tutorial_progress(user_id);
ALTER TABLE public.tutorial_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tut_prog_select_own" ON public.tutorial_progress;
CREATE POLICY "tut_prog_select_own" ON public.tutorial_progress
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "tut_prog_insert_own" ON public.tutorial_progress;
CREATE POLICY "tut_prog_insert_own" ON public.tutorial_progress
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "tut_prog_update_own" ON public.tutorial_progress;
CREATE POLICY "tut_prog_update_own" ON public.tutorial_progress
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_tut_prog_updated_at ON public.tutorial_progress;
CREATE TRIGGER trg_tut_prog_updated_at
  BEFORE UPDATE ON public.tutorial_progress
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO storage.buckets (id, name, public)
VALUES ('tutorials','tutorials', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "tutorials_public_read" ON storage.objects;
CREATE POLICY "tutorials_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'tutorials');

DROP POLICY IF EXISTS "tutorials_admin_write" ON storage.objects;
CREATE POLICY "tutorials_admin_write" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'tutorials' AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')))
  WITH CHECK (bucket_id = 'tutorials' AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')));