
ALTER TABLE public.live_streams
  ADD COLUMN IF NOT EXISTS auction_reveal_mode text NOT NULL DEFAULT 'none';

ALTER TABLE public.live_streams
  ADD CONSTRAINT live_streams_auction_reveal_mode_check
  CHECK (auction_reveal_mode IN ('none','wheel','break'));

-- Update host-only field guard to include the new column
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
     OR NEW.auction_reveal_mode IS DISTINCT FROM OLD.auction_reveal_mode
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
