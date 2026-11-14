CREATE TABLE public.personal_social_identities (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 username text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9_.]{3,40}$'),
 display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 100),
 bio text NOT NULL DEFAULT '' CHECK (length(bio)<=1000),
 audience text NOT NULL DEFAULT 'only_me' CHECK(audience IN ('public','followers','friends','only_me')),
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE ON public.personal_social_identities TO authenticated;
GRANT ALL ON public.personal_social_identities TO service_role;
ALTER TABLE public.personal_social_identities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Candidate identity owner read" ON public.personal_social_identities FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY "Candidate identity owner create" ON public.personal_social_identities FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid());
CREATE POLICY "Candidate identity owner edit" ON public.personal_social_identities FOR UPDATE TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE TABLE public.personal_social_posts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 caption text NOT NULL CHECK(length(caption) BETWEEN 1 AND 5000),
 audience text NOT NULL DEFAULT 'only_me' CHECK(audience IN ('public','followers','friends','only_me')),
 allow_comments boolean NOT NULL DEFAULT true,
 pinned boolean NOT NULL DEFAULT false,
 collectible_id uuid REFERENCES public.vault_cards(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.personal_social_posts TO authenticated;
GRANT ALL ON public.personal_social_posts TO service_role;
ALTER TABLE public.personal_social_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Candidate story owner read" ON public.personal_social_posts FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY "Candidate story owner create" ON public.personal_social_posts FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() AND (collectible_id IS NULL OR EXISTS(SELECT 1 FROM public.vault_cards c WHERE c.id=collectible_id AND c.user_id=auth.uid())));
CREATE POLICY "Candidate story owner edit" ON public.personal_social_posts FOR UPDATE TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid() AND (collectible_id IS NULL OR EXISTS(SELECT 1 FROM public.vault_cards c WHERE c.id=collectible_id AND c.user_id=auth.uid())));
CREATE POLICY "Candidate story owner delete" ON public.personal_social_posts FOR DELETE TO authenticated USING(user_id=auth.uid());
CREATE TABLE public.personal_social_media (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 post_id uuid REFERENCES public.personal_social_posts(id) ON DELETE CASCADE,
 object_path text NOT NULL UNIQUE,
 kind text NOT NULL CHECK(kind IN ('image','video')),
 slot text NOT NULL CHECK(slot IN ('post','avatar','cover0','cover1','cover2')),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(split_part(object_path,'/',1)=user_id::text AND object_path !~ '(^|/)\.\.(/|$)' AND object_path !~ '[?%#]'),
 CHECK((slot='post' AND post_id IS NOT NULL) OR (slot<>'post' AND post_id IS NULL AND kind='image'))
);
GRANT SELECT,INSERT,DELETE ON public.personal_social_media TO authenticated;
GRANT ALL ON public.personal_social_media TO service_role;
ALTER TABLE public.personal_social_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Candidate media owner read" ON public.personal_social_media FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY "Candidate media owner bind" ON public.personal_social_media FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() AND (post_id IS NULL OR EXISTS(SELECT 1 FROM public.personal_social_posts p WHERE p.id=post_id AND p.user_id=auth.uid())));
CREATE POLICY "Candidate media owner delete" ON public.personal_social_media FOR DELETE TO authenticated USING(user_id=auth.uid());
CREATE TABLE public.personal_social_comments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 post_id uuid NOT NULL REFERENCES public.personal_social_posts(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 content text NOT NULL CHECK(length(content) BETWEEN 1 AND 2000),
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.personal_social_comments TO authenticated;
GRANT ALL ON public.personal_social_comments TO service_role;
ALTER TABLE public.personal_social_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Candidate comments parent read" ON public.personal_social_comments FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.personal_social_posts p WHERE p.id=post_id AND p.user_id=auth.uid()));
CREATE POLICY "Candidate comments parent create" ON public.personal_social_comments FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() AND EXISTS(SELECT 1 FROM public.personal_social_posts p WHERE p.id=post_id AND p.user_id=auth.uid() AND p.allow_comments));
CREATE POLICY "Candidate comments parent edit" ON public.personal_social_comments FOR UPDATE TO authenticated USING(user_id=auth.uid() AND EXISTS(SELECT 1 FROM public.personal_social_posts p WHERE p.id=post_id AND p.user_id=auth.uid() AND p.allow_comments)) WITH CHECK(user_id=auth.uid() AND EXISTS(SELECT 1 FROM public.personal_social_posts p WHERE p.id=post_id AND p.user_id=auth.uid() AND p.allow_comments));
CREATE POLICY "Candidate comments owner moderation" ON public.personal_social_comments FOR DELETE TO authenticated USING(EXISTS(SELECT 1 FROM public.personal_social_posts p WHERE p.id=post_id AND p.user_id=auth.uid()));
CREATE TABLE public.personal_social_reactions (
 post_id uuid NOT NULL REFERENCES public.personal_social_posts(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(post_id,user_id)
);
GRANT SELECT,INSERT,DELETE ON public.personal_social_reactions TO authenticated;
GRANT ALL ON public.personal_social_reactions TO service_role;
ALTER TABLE public.personal_social_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Candidate reactions parent read" ON public.personal_social_reactions FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.personal_social_posts p WHERE p.id=post_id AND p.user_id=auth.uid()));
CREATE POLICY "Candidate reactions parent create" ON public.personal_social_reactions FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() AND EXISTS(SELECT 1 FROM public.personal_social_posts p WHERE p.id=post_id AND p.user_id=auth.uid()));
CREATE POLICY "Candidate reactions parent delete" ON public.personal_social_reactions FOR DELETE TO authenticated USING(user_id=auth.uid() AND EXISTS(SELECT 1 FROM public.personal_social_posts p WHERE p.id=post_id AND p.user_id=auth.uid()));
CREATE POLICY "Candidate private media read" ON storage.objects FOR SELECT TO authenticated USING(bucket_id='personal-profile-media' AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY "Candidate private media upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='personal-profile-media' AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY "Candidate private media delete" ON storage.objects FOR DELETE TO authenticated USING(bucket_id='personal-profile-media' AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY "Candidate private media restrictive boundary" ON storage.objects AS RESTRICTIVE FOR ALL TO anon,authenticated USING(bucket_id<>'personal-profile-media' OR (auth.uid() IS NOT NULL AND (storage.foldername(name))[1]=auth.uid()::text)) WITH CHECK(bucket_id<>'personal-profile-media' OR (auth.uid() IS NOT NULL AND (storage.foldername(name))[1]=auth.uid()::text));
COMMENT ON TABLE public.personal_social_posts IS 'Unreleased isolated owner candidate. No visitor policy until migration provenance and private-media integration verification are complete. No changes to production 0017.';