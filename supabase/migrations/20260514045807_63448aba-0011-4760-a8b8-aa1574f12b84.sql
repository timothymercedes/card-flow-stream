
-- Pre-B enhancements to auction_queue
ALTER TABLE public.auction_queue
  ADD COLUMN IF NOT EXISTS prebid_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS scheduled_show_id uuid REFERENCES public.scheduled_shows(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS description text;

CREATE INDEX IF NOT EXISTS idx_auction_queue_show ON public.auction_queue(scheduled_show_id);

-- Pre-bids table: viewers place bids on queued (not-yet-live) items
CREATE TABLE IF NOT EXISTS public.prebids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_item_id uuid NOT NULL REFERENCES public.auction_queue(id) ON DELETE CASCADE,
  bidder_id uuid NOT NULL,
  bidder_username text,
  amount numeric NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prebids_item ON public.prebids(queue_item_id, amount DESC);
CREATE INDEX IF NOT EXISTS idx_prebids_bidder ON public.prebids(bidder_id);

ALTER TABLE public.prebids ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prebids viewable by anyone"
  ON public.prebids FOR SELECT USING (true);

CREATE POLICY "users place own prebids"
  ON public.prebids FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = bidder_id);

CREATE POLICY "users delete own prebids"
  ON public.prebids FOR DELETE TO authenticated
  USING (auth.uid() = bidder_id);

-- Scheduled shows: banner + categories + link to live stream
ALTER TABLE public.scheduled_shows
  ADD COLUMN IF NOT EXISTS banner_url text,
  ADD COLUMN IF NOT EXISTS categories text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS stream_id uuid REFERENCES public.live_streams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_scheduled_shows_stream ON public.scheduled_shows(stream_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.prebids;
ALTER PUBLICATION supabase_realtime ADD TABLE public.scheduled_shows;
ALTER PUBLICATION supabase_realtime ADD TABLE public.show_bookmarks;

-- Storage bucket for show banners and prebid item images
INSERT INTO storage.buckets (id, name, public)
VALUES ('show-banners', 'show-banners', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "show-banners public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'show-banners');

CREATE POLICY "show-banners auth upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'show-banners' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "show-banners owner update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'show-banners' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "show-banners owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'show-banners' AND (storage.foldername(name))[1] = auth.uid()::text);
