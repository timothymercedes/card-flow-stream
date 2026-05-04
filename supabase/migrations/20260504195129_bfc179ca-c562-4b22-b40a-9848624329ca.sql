-- Sudden death config + quantity on live_streams
ALTER TABLE public.live_streams
  ADD COLUMN IF NOT EXISTS sudden_death_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sudden_death_max_triggers integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS sudden_death_seconds_added integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS sudden_death_triggers_used integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS quantity_remaining integer;

-- Allow non-owners (bidders) to update the new SD counter via the trigger guard
CREATE OR REPLACE FUNCTION public.live_streams_restrict_bidder_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() = OLD.seller_id THEN
    RETURN NEW;
  END IF;
  IF NEW.seller_id IS DISTINCT FROM OLD.seller_id
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.winner_id IS DISTINCT FROM OLD.winner_id
     OR NEW.winner_username IS DISTINCT FROM OLD.winner_username
     OR NEW.winning_bid IS DISTINCT FROM OLD.winning_bid
     OR NEW.cf_stream_key IS DISTINCT FROM OLD.cf_stream_key
     OR NEW.cf_rtmps_url IS DISTINCT FROM OLD.cf_rtmps_url
     OR NEW.cf_live_input_id IS DISTINCT FROM OLD.cf_live_input_id
     OR NEW.cf_playback_hls IS DISTINCT FROM OLD.cf_playback_hls
     OR NEW.cf_video_uid IS DISTINCT FROM OLD.cf_video_uid
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.shipping_price IS DISTINCT FROM OLD.shipping_price
     OR NEW.shipping_method IS DISTINCT FROM OLD.shipping_method
     OR NEW.starting_bid IS DISTINCT FROM OLD.starting_bid
     OR NEW.break_mode IS DISTINCT FROM OLD.break_mode
     OR NEW.quick_start_enabled IS DISTINCT FROM OLD.quick_start_enabled
     OR NEW.default_timer_sec IS DISTINCT FROM OLD.default_timer_sec
     OR NEW.default_starting_bid IS DISTINCT FROM OLD.default_starting_bid
     OR NEW.chat_slow_mode_sec IS DISTINCT FROM OLD.chat_slow_mode_sec
     OR NEW.sudden_death_enabled IS DISTINCT FROM OLD.sudden_death_enabled
     OR NEW.sudden_death_max_triggers IS DISTINCT FROM OLD.sudden_death_max_triggers
     OR NEW.sudden_death_seconds_added IS DISTINCT FROM OLD.sudden_death_seconds_added
     OR NEW.quantity IS DISTINCT FROM OLD.quantity
  THEN
    RAISE EXCEPTION 'Only the stream owner can modify this field';
  END IF;
  IF NEW.current_bid IS DISTINCT FROM OLD.current_bid THEN
    IF NEW.current_bid <= OLD.current_bid THEN
      RAISE EXCEPTION 'New bid must exceed current bid';
    END IF;
    IF NEW.current_bidder_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Bidder must be the authenticated user';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Live stream presence
CREATE TABLE IF NOT EXISTS public.live_stream_presence (
  stream_id uuid NOT NULL,
  user_id uuid NOT NULL,
  username text NOT NULL,
  avatar_url text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (stream_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_lsp_stream_lastseen ON public.live_stream_presence(stream_id, last_seen_at DESC);

ALTER TABLE public.live_stream_presence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Presence viewable by all" ON public.live_stream_presence;
CREATE POLICY "Presence viewable by all" ON public.live_stream_presence FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users upsert own presence" ON public.live_stream_presence;
CREATE POLICY "Users upsert own presence" ON public.live_stream_presence FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own presence" ON public.live_stream_presence;
CREATE POLICY "Users update own presence" ON public.live_stream_presence FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own presence" ON public.live_stream_presence;
CREATE POLICY "Users delete own presence" ON public.live_stream_presence FOR DELETE USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.live_stream_presence;

-- Reports table (orders, sellers, buyers, messages, posts)
CREATE TABLE IF NOT EXISTS public.user_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL,
  reporter_username text NOT NULL,
  target_type text NOT NULL CHECK (target_type IN ('user','order','message','stream','post','listing')),
  target_id uuid,
  target_label text,
  category text NOT NULL DEFAULT 'other',
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed')),
  resolution_note text,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth users file reports" ON public.user_reports;
CREATE POLICY "Auth users file reports" ON public.user_reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Reporter views own reports" ON public.user_reports;
CREATE POLICY "Reporter views own reports" ON public.user_reports FOR SELECT
  USING (auth.uid() = reporter_id OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins update reports" ON public.user_reports;
CREATE POLICY "Admins update reports" ON public.user_reports FOR UPDATE USING (public.has_role(auth.uid(), 'admin'::app_role));