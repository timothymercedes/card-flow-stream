
-- Bookmarks for scheduled live shows. Lets guests-turned-users tap a "Bookmark" button on
-- upcoming shows and get a heads-up when the seller goes live.
CREATE TABLE IF NOT EXISTS public.show_bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  show_id uuid NOT NULL REFERENCES public.scheduled_shows(id) ON DELETE CASCADE,
  notify_push boolean NOT NULL DEFAULT true,
  notify_email boolean NOT NULL DEFAULT false,
  notify_inapp boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, show_id)
);

CREATE INDEX IF NOT EXISTS show_bookmarks_user_idx ON public.show_bookmarks(user_id);
CREATE INDEX IF NOT EXISTS show_bookmarks_show_idx ON public.show_bookmarks(show_id);

ALTER TABLE public.show_bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own bookmarks"
  ON public.show_bookmarks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own bookmarks"
  ON public.show_bookmarks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own bookmarks"
  ON public.show_bookmarks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own bookmarks"
  ON public.show_bookmarks FOR DELETE
  USING (auth.uid() = user_id);
