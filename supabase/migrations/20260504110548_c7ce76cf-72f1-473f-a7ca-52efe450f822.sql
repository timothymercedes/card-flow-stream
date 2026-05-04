-- ============== MYSTERY BREAK: numbered slots ==============
ALTER TABLE public.live_streams
  ADD COLUMN IF NOT EXISTS break_slot_count integer,
  ADD COLUMN IF NOT EXISTS break_slot_prefix text;

ALTER TABLE public.break_slots
  ADD COLUMN IF NOT EXISTS slot_number integer;

CREATE UNIQUE INDEX IF NOT EXISTS break_slots_stream_number_uniq
  ON public.break_slots (stream_id, slot_number)
  WHERE slot_number IS NOT NULL;

-- ============== GIVEAWAYS: "Lucky Letter Drop" ==============
CREATE TABLE IF NOT EXISTS public.giveaways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'Live Giveaway',
  prize_label text NOT NULL,
  code text NOT NULL,                        -- short letter sequence (e.g. "WIN")
  eligibility text NOT NULL DEFAULT 'anyone' CHECK (eligibility IN ('anyone','followers','buyers')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','drawing','complete')),
  winner_id uuid,
  winner_username text,
  shipping_covered boolean NOT NULL DEFAULT true,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  drawn_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS giveaways_stream_idx ON public.giveaways (stream_id);

ALTER TABLE public.giveaways ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Giveaways viewable by all"
  ON public.giveaways FOR SELECT USING (true);

CREATE POLICY "Host creates giveaway"
  ON public.giveaways FOR INSERT
  WITH CHECK (
    auth.uid() = seller_id AND EXISTS (
      SELECT 1 FROM public.live_streams ls WHERE ls.id = giveaways.stream_id AND ls.seller_id = auth.uid()
    )
  );

CREATE POLICY "Host updates giveaway"
  ON public.giveaways FOR UPDATE USING (auth.uid() = seller_id);

-- Entries (one per qualifying viewer)
CREATE TABLE IF NOT EXISTS public.giveaway_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  giveaway_id uuid NOT NULL REFERENCES public.giveaways(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  username text NOT NULL,
  reaction_ms integer,                       -- total time it took to complete the letter sequence
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (giveaway_id, user_id)
);

CREATE INDEX IF NOT EXISTS giveaway_entries_giveaway_idx ON public.giveaway_entries (giveaway_id);

ALTER TABLE public.giveaway_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Entries viewable by all"
  ON public.giveaway_entries FOR SELECT USING (true);

-- Enter only into an OPEN giveaway, only as yourself, and only if you match eligibility.
CREATE POLICY "Viewer self-enters open giveaway"
  ON public.giveaway_entries FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.giveaways g
      WHERE g.id = giveaway_entries.giveaway_id
        AND g.status = 'open'
        AND auth.uid() <> g.seller_id  -- host can't enter own giveaway
        AND (
          g.eligibility = 'anyone'
          OR (g.eligibility = 'followers' AND EXISTS (
              SELECT 1 FROM public.follows f WHERE f.follower_id = auth.uid() AND f.followee_id = g.seller_id
          ))
          OR (g.eligibility = 'buyers' AND EXISTS (
              SELECT 1 FROM public.orders o WHERE o.buyer_id = auth.uid() AND o.seller_id = g.seller_id
          ))
        )
    )
  );

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.giveaways;
ALTER PUBLICATION supabase_realtime ADD TABLE public.giveaway_entries;