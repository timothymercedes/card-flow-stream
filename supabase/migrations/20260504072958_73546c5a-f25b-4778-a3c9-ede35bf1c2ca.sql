
-- Stories
CREATE TABLE public.stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  username text NOT NULL,
  avatar_url text,
  image_url text NOT NULL,
  caption text,
  visibility text NOT NULL DEFAULT 'public',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.story_close_friends (
  owner_id uuid NOT NULL,
  friend_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, friend_id)
);
ALTER TABLE public.story_close_friends ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.story_views (
  story_id uuid NOT NULL,
  viewer_id uuid NOT NULL,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, viewer_id)
);
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;

-- Helper function: check if viewer can see story
CREATE OR REPLACE FUNCTION public.can_view_story(_story_owner uuid, _visibility text, _viewer uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    CASE
      WHEN _viewer = _story_owner THEN true
      WHEN _visibility = 'public' THEN true
      WHEN _visibility = 'followers' THEN EXISTS (SELECT 1 FROM public.follows WHERE follower_id = _viewer AND followee_id = _story_owner)
      WHEN _visibility = 'close_friends' THEN EXISTS (SELECT 1 FROM public.story_close_friends WHERE owner_id = _story_owner AND friend_id = _viewer)
      ELSE false
    END
$$;

CREATE POLICY "Stories visible per privacy" ON public.stories FOR SELECT
  USING (expires_at > now() AND public.can_view_story(user_id, visibility, auth.uid()));
CREATE POLICY "Owners create stories" ON public.stories FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners delete stories" ON public.stories FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Owners manage close friends" ON public.story_close_friends FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Auth users record views" ON public.story_views FOR INSERT
  WITH CHECK (auth.uid() = viewer_id);
CREATE POLICY "Viewers and owners see views" ON public.story_views FOR SELECT
  USING (auth.uid() = viewer_id OR EXISTS (SELECT 1 FROM public.stories s WHERE s.id = story_id AND s.user_id = auth.uid()));

-- Scheduled shows
CREATE TABLE public.scheduled_shows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL,
  seller_username text NOT NULL,
  title text NOT NULL,
  description text,
  thumbnail_url text,
  category text,
  scheduled_for timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.scheduled_shows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Shows viewable by all" ON public.scheduled_shows FOR SELECT USING (true);
CREATE POLICY "Sellers create shows" ON public.scheduled_shows FOR INSERT WITH CHECK (auth.uid() = seller_id);
CREATE POLICY "Sellers update shows" ON public.scheduled_shows FOR UPDATE USING (auth.uid() = seller_id);
CREATE POLICY "Sellers delete shows" ON public.scheduled_shows FOR DELETE USING (auth.uid() = seller_id);

-- Storage bucket for stories
INSERT INTO storage.buckets (id, name, public) VALUES ('stories', 'stories', true) ON CONFLICT DO NOTHING;
CREATE POLICY "Stories images public read" ON storage.objects FOR SELECT USING (bucket_id = 'stories');
CREATE POLICY "Auth users upload story images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'stories' AND auth.uid() IS NOT NULL);
CREATE POLICY "Owners delete own story images" ON storage.objects FOR DELETE USING (bucket_id = 'stories' AND auth.uid()::text = (storage.foldername(name))[1]);
