
ALTER TABLE public.live_streams
  ADD COLUMN IF NOT EXISTS ko_accepts_requests boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ko_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ko_message text,
  ADD COLUMN IF NOT EXISTS ko_destinations jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ko_started_at timestamptz;

CREATE TABLE IF NOT EXISTS public.ko_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_stream_id uuid NOT NULL,
  from_seller_id uuid NOT NULL,
  from_username text NOT NULL,
  from_avatar_url text,
  from_viewer_count integer NOT NULL DEFAULT 0,
  to_stream_id uuid NOT NULL,
  to_seller_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ko_requests_to_stream_idx ON public.ko_requests(to_stream_id, status);
CREATE INDEX IF NOT EXISTS ko_requests_from_stream_idx ON public.ko_requests(from_stream_id);

ALTER TABLE public.ko_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "KO request parties view"
  ON public.ko_requests FOR SELECT
  USING (auth.uid() = from_seller_id OR auth.uid() = to_seller_id);

CREATE POLICY "Hosts request KO from accepting stream"
  ON public.ko_requests FOR INSERT
  WITH CHECK (
    auth.uid() = from_seller_id
    AND EXISTS (
      SELECT 1 FROM public.live_streams ls
      WHERE ls.id = from_stream_id AND ls.seller_id = auth.uid() AND ls.status = 'live'
    )
    AND EXISTS (
      SELECT 1 FROM public.live_streams ls2
      WHERE ls2.id = to_stream_id AND ls2.status = 'live' AND ls2.ko_accepts_requests = true
    )
  );

CREATE POLICY "Receiving host updates KO request"
  ON public.ko_requests FOR UPDATE
  USING (auth.uid() = to_seller_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.ko_requests;
ALTER TABLE public.ko_requests REPLICA IDENTITY FULL;
