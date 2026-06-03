CREATE TABLE public.arena_feed_posts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  battle_id uuid REFERENCES public.arena_battles(id) ON DELETE SET NULL,
  caption text,
  won boolean NOT NULL DEFAULT false,
  opponent_name text,
  companion_name text,
  image_url text,
  like_count integer NOT NULL DEFAULT 0,
  comment_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.arena_feed_likes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES public.arena_feed_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);

CREATE TABLE public.arena_feed_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES public.arena_feed_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.arena_feed_posts TO authenticated;
GRANT ALL ON public.arena_feed_posts TO service_role;
GRANT SELECT, INSERT, DELETE ON public.arena_feed_likes TO authenticated;
GRANT ALL ON public.arena_feed_likes TO service_role;
GRANT SELECT, INSERT, DELETE ON public.arena_feed_comments TO authenticated;
GRANT ALL ON public.arena_feed_comments TO service_role;

ALTER TABLE public.arena_feed_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arena_feed_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arena_feed_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Feed posts are viewable by authenticated users"
  ON public.arena_feed_posts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create their own feed posts"
  ON public.arena_feed_posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own feed posts"
  ON public.arena_feed_posts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own feed posts"
  ON public.arena_feed_posts FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Feed likes are viewable by authenticated users"
  ON public.arena_feed_likes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can like as themselves"
  ON public.arena_feed_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can remove their own likes"
  ON public.arena_feed_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Feed comments are viewable by authenticated users"
  ON public.arena_feed_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can comment as themselves"
  ON public.arena_feed_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own comments"
  ON public.arena_feed_comments FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_arena_feed_posts_updated_at
  BEFORE UPDATE ON public.arena_feed_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.arena_feed_like_count() RETURNS TRIGGER
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.arena_feed_posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.arena_feed_posts SET like_count = GREATEST(0, like_count - 1) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER arena_feed_like_count_trigger
  AFTER INSERT OR DELETE ON public.arena_feed_likes
  FOR EACH ROW EXECUTE FUNCTION public.arena_feed_like_count();

CREATE OR REPLACE FUNCTION public.arena_feed_comment_count() RETURNS TRIGGER
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.arena_feed_posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.arena_feed_posts SET comment_count = GREATEST(0, comment_count - 1) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER arena_feed_comment_count_trigger
  AFTER INSERT OR DELETE ON public.arena_feed_comments
  FOR EACH ROW EXECUTE FUNCTION public.arena_feed_comment_count();