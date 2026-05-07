DROP POLICY IF EXISTS "Tips viewable by all" ON public.stream_tips;

CREATE POLICY "Tips viewable by signed-in users"
ON public.stream_tips
FOR SELECT
TO authenticated
USING (true);