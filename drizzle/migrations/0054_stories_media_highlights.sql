ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'image';
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS sequence_id uuid;
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS overlays jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.stories ADD CONSTRAINT stories_media_type_chk CHECK (media_type IN ('image','video'));

CREATE TABLE public.story_highlights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 30),
  cover_story_id uuid REFERENCES public.stories(id) ON DELETE SET NULL,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.story_highlight_items (
  highlight_id uuid NOT NULL REFERENCES public.story_highlights(id) ON DELETE CASCADE,
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (highlight_id, story_id)
);
GRANT SELECT ON public.story_highlights, public.story_highlight_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_highlights, public.story_highlight_items TO authenticated;
GRANT ALL ON public.story_highlights, public.story_highlight_items TO service_role;
ALTER TABLE public.story_highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_highlight_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Highlights readable" ON public.story_highlights FOR SELECT USING (true);
CREATE POLICY "Owners manage highlights" ON public.story_highlights FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Highlight items readable" ON public.story_highlight_items FOR SELECT USING (true);
CREATE POLICY "Owners manage highlight items" ON public.story_highlight_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.story_highlights h WHERE h.id = highlight_id AND h.user_id = auth.uid()))
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.story_highlights h WHERE h.id = highlight_id AND h.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.stories s WHERE s.id = story_id AND s.user_id = auth.uid() AND s.deleted_at IS NULL)
  );

CREATE OR REPLACE FUNCTION public.story_is_highlighted(_story_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.story_highlight_items WHERE story_id = _story_id)
$$;
REVOKE EXECUTE ON FUNCTION public.story_is_highlighted(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.story_is_highlighted(uuid) TO anon, authenticated;

CREATE POLICY "Highlighted stories visible per privacy" ON public.stories FOR SELECT
  USING (deleted_at IS NULL AND public.story_is_highlighted(id) AND public.can_view_story(user_id, visibility, auth.uid()));