
DROP POLICY IF EXISTS "Anyone authenticated can read cohost tracks" ON public.stream_cohost_tracks;
CREATE POLICY "Public can read cohost tracks"
  ON public.stream_cohost_tracks FOR SELECT
  USING (true);
