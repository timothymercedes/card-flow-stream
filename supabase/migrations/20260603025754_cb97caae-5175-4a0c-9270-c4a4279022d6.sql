-- Priority 4: Communities — official per-category communities with feed, posts, likes, comments, membership.

-- Communities (official, one per category to start)
CREATE TABLE public.communities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT,
  description TEXT,
  emoji TEXT,
  cover_url TEXT,
  is_official BOOLEAN NOT NULL DEFAULT true,
  member_count INTEGER NOT NULL DEFAULT 0,
  post_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.communities TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.communities TO authenticated;
GRANT ALL ON public.communities TO service_role;

ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Communities are viewable by everyone"
ON public.communities FOR SELECT USING (true);

-- Membership
CREATE TABLE public.community_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (community_id, user_id)
);

GRANT SELECT ON public.community_members TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_members TO authenticated;
GRANT ALL ON public.community_members TO service_role;

ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members are viewable by everyone"
ON public.community_members FOR SELECT USING (true);

CREATE POLICY "Users can join communities"
ON public.community_members FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave communities"
ON public.community_members FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX idx_community_members_user ON public.community_members(user_id);
CREATE INDEX idx_community_members_community ON public.community_members(community_id);

-- Posts
CREATE TABLE public.community_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  body TEXT NOT NULL,
  image_url TEXT,
  like_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.community_posts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_posts TO authenticated;
GRANT ALL ON public.community_posts TO service_role;

ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Posts are viewable by everyone"
ON public.community_posts FOR SELECT USING (true);

CREATE POLICY "Members can create posts"
ON public.community_posts FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.community_members m
    WHERE m.community_id = community_posts.community_id AND m.user_id = auth.uid()
  )
);

CREATE POLICY "Authors can update their posts"
ON public.community_posts FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Authors can delete their posts"
ON public.community_posts FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX idx_community_posts_community ON public.community_posts(community_id, created_at DESC);

-- Likes
CREATE TABLE public.community_post_likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);

GRANT SELECT ON public.community_post_likes TO anon;
GRANT SELECT, INSERT, DELETE ON public.community_post_likes TO authenticated;
GRANT ALL ON public.community_post_likes TO service_role;

ALTER TABLE public.community_post_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Likes are viewable by everyone"
ON public.community_post_likes FOR SELECT USING (true);

CREATE POLICY "Users can like"
ON public.community_post_likes FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike"
ON public.community_post_likes FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- Comments
CREATE TABLE public.community_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.community_comments TO anon;
GRANT SELECT, INSERT, DELETE ON public.community_comments TO authenticated;
GRANT ALL ON public.community_comments TO service_role;

ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comments are viewable by everyone"
ON public.community_comments FOR SELECT USING (true);

CREATE POLICY "Users can comment"
ON public.community_comments FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their comments"
ON public.community_comments FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX idx_community_comments_post ON public.community_comments(post_id, created_at);

-- updated_at triggers
CREATE TRIGGER set_communities_updated_at BEFORE UPDATE ON public.communities
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_community_posts_updated_at BEFORE UPDATE ON public.community_posts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Counter maintenance: member_count
CREATE OR REPLACE FUNCTION public.bump_community_member_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.communities SET member_count = member_count + 1 WHERE id = NEW.community_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.communities SET member_count = GREATEST(member_count - 1, 0) WHERE id = OLD.community_id;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_community_member_count
AFTER INSERT OR DELETE ON public.community_members
FOR EACH ROW EXECUTE FUNCTION public.bump_community_member_count();

-- Counter maintenance: post_count
CREATE OR REPLACE FUNCTION public.bump_community_post_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.communities SET post_count = post_count + 1 WHERE id = NEW.community_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.communities SET post_count = GREATEST(post_count - 1, 0) WHERE id = OLD.community_id;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_community_post_count
AFTER INSERT OR DELETE ON public.community_posts
FOR EACH ROW EXECUTE FUNCTION public.bump_community_post_count();

-- Counter maintenance: like_count
CREATE OR REPLACE FUNCTION public.bump_post_like_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.community_posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.community_posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_post_like_count
AFTER INSERT OR DELETE ON public.community_post_likes
FOR EACH ROW EXECUTE FUNCTION public.bump_post_like_count();

-- Counter maintenance: comment_count
CREATE OR REPLACE FUNCTION public.bump_post_comment_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.community_posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.community_posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_post_comment_count
AFTER INSERT OR DELETE ON public.community_comments
FOR EACH ROW EXECUTE FUNCTION public.bump_post_comment_count();

-- Seed official per-category communities
INSERT INTO public.communities (slug, name, category, emoji, description) VALUES
  ('pokemon', 'Pokémon Collectors', 'pokemon', '⚡', 'Trade, show off, and complete your Pokémon sets with collectors worldwide.'),
  ('one-piece', 'One Piece Crew', 'one_piece', '🏴‍☠️', 'Set sail with One Piece TCG collectors — pulls, trades, and deck talk.'),
  ('magic', 'Magic: The Gathering', 'magic', '🪄', 'For planeswalkers collecting and trading MTG cards.'),
  ('yugioh', 'Yu-Gi-Oh! Duelists', 'yugioh', '🐉', 'It''s time to duel — collect and trade Yu-Gi-Oh! cards.'),
  ('dragon-ball', 'Dragon Ball Super', 'dragon_ball', '🐲', 'Power up your Dragon Ball collection.'),
  ('lorcana', 'Disney Lorcana', 'lorcana', '🏰', 'Illumineers gathering to collect and trade Lorcana.'),
  ('digimon', 'Digimon Tamers', 'digimon', '🦖', 'Digivolve your Digimon TCG collection.'),
  ('sports', 'Sports Cards', 'sports', '🏆', 'Baseball, basketball, football and more — the hobby lives here.'),
  ('funko', 'Funko Pop Collectors', 'funko', '🎁', 'Hunt grails and trade Funko Pops.'),
  ('manga', 'Manga & Comics', 'manga', '📚', 'Collectors of manga, comics, and graphic novels.'),
  ('memorabilia', 'Memorabilia', 'memorabilia', '🪙', 'Autographs, relics, and collectible memorabilia.'),
  ('other', 'All Collectibles', 'other', '✨', 'A home for every kind of collector.');
