ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by text,
  ADD COLUMN IF NOT EXISTS deletion_reason text,
  ADD COLUMN IF NOT EXISTS previous_visibility text,
  ADD COLUMN IF NOT EXISTS retain_until timestamptz;
ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by text,
  ADD COLUMN IF NOT EXISTS deletion_reason text,
  ADD COLUMN IF NOT EXISTS previous_visibility text,
  ADD COLUMN IF NOT EXISTS retain_until timestamptz;
ALTER TABLE public.posts ADD CONSTRAINT posts_deleted_by_valid CHECK (deleted_by IS NULL OR deleted_by IN ('owner','admin'));
ALTER TABLE public.stories ADD CONSTRAINT stories_deleted_by_valid CHECK (deleted_by IS NULL OR deleted_by IN ('owner','admin'));
CREATE INDEX IF NOT EXISTS posts_user_deleted_idx ON public.posts(user_id, deleted_at);
CREATE INDEX IF NOT EXISTS stories_user_deleted_idx ON public.stories(user_id, deleted_at);

-- Members cannot touch deletion fields or edit deleted rows; only service role (admin server code) can.
CREATE OR REPLACE FUNCTION public.guard_social_soft_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_setting('app.soft_delete', true) = 'on' OR auth.role() = 'service_role' THEN RETURN NEW; END IF;
  IF OLD.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Deleted content cannot be changed'; END IF;
  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at OR NEW.deleted_by IS DISTINCT FROM OLD.deleted_by
     OR NEW.deletion_reason IS DISTINCT FROM OLD.deletion_reason OR NEW.previous_visibility IS DISTINCT FROM OLD.previous_visibility
     OR NEW.retain_until IS DISTINCT FROM OLD.retain_until THEN
    RAISE EXCEPTION 'Use the delete action to delete content';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER posts_guard_soft_delete BEFORE UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.guard_social_soft_delete();
CREATE TRIGGER stories_guard_soft_delete BEFORE UPDATE ON public.stories FOR EACH ROW EXECUTE FUNCTION public.guard_social_soft_delete();

CREATE OR REPLACE FUNCTION public.soft_delete_post(_post_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('app.soft_delete', 'on', true);
  UPDATE public.posts SET deleted_at = now(), deleted_by = 'owner', previous_visibility = visibility,
    retain_until = now() + interval '90 days'
  WHERE id = _post_id AND user_id = auth.uid() AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Post not found'; END IF;
  PERFORM set_config('app.soft_delete', 'off', true);
END $$;
CREATE OR REPLACE FUNCTION public.soft_delete_story(_story_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('app.soft_delete', 'on', true);
  UPDATE public.stories SET deleted_at = now(), deleted_by = 'owner', previous_visibility = visibility,
    retain_until = now() + interval '90 days'
  WHERE id = _story_id AND user_id = auth.uid() AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Story not found'; END IF;
  PERFORM set_config('app.soft_delete', 'off', true);
END $$;
REVOKE ALL ON FUNCTION public.soft_delete_post(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.soft_delete_story(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_post(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_story(uuid) TO authenticated;

-- No more permanent deletes by members.
DROP POLICY IF EXISTS "Users delete own posts" ON public.posts;
DROP POLICY IF EXISTS "Owners delete stories" ON public.stories;

CREATE OR REPLACE FUNCTION public.social_post_visible(_post uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT EXISTS(SELECT 1 FROM public.posts p WHERE p.id=_post AND p.deleted_at IS NULL AND (p.user_id=auth.uid() OR (p.moderation_status='approved' AND public.social_audience_visible(p.user_id,p.visibility)))) $function$;

DROP POLICY IF EXISTS "Stories visible per privacy" ON public.stories;
CREATE POLICY "Stories visible per privacy" ON public.stories FOR SELECT
  USING (deleted_at IS NULL AND expires_at > now() AND public.can_view_story(user_id, visibility, auth.uid()));
CREATE POLICY "Owners read own story archive" ON public.stories FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND user_id = auth.uid());

DROP POLICY IF EXISTS "Stories storage respects visibility" ON storage.objects;
CREATE POLICY "Stories storage respects visibility" ON storage.objects FOR SELECT
  USING (bucket_id = 'stories' AND auth.uid() IS NOT NULL AND (
    (storage.foldername(name))[1] = auth.uid()::text OR EXISTS (
      SELECT 1 FROM public.stories s WHERE s.image_url LIKE '%' || objects.name || '%'
        AND s.deleted_at IS NULL AND s.expires_at > now() AND public.can_view_story(s.user_id, s.visibility, auth.uid()))));