CREATE POLICY "Highlighted story media respects visibility" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'stories' AND EXISTS (
  SELECT 1 FROM public.stories s
  WHERE s.image_url LIKE '%' || objects.name || '%' AND s.deleted_at IS NULL
    AND public.story_is_highlighted(s.id) AND public.can_view_story(s.user_id, s.visibility, auth.uid())));