
-- Tighten live_streams bidder update guard to a strict allowlist.
CREATE OR REPLACE FUNCTION public.live_streams_restrict_bidder_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- Never let a non-owner persist Cloudflare ingest secrets.
  IF v_uid IS DISTINCT FROM OLD.seller_id THEN
    NEW.cf_live_input_id := OLD.cf_live_input_id;
    NEW.cf_rtmps_url    := OLD.cf_rtmps_url;
    NEW.cf_stream_key   := OLD.cf_stream_key;
  END IF;

  IF v_uid = OLD.seller_id THEN
    RETURN NEW;
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Bidders may ONLY change current_bid + current_bidder_id.
  -- Force every other column back to its previous value.
  NEW.id                          := OLD.id;
  NEW.seller_id                   := OLD.seller_id;
  NEW.title                       := OLD.title;
  NEW.description                 := OLD.description;
  NEW.status                      := OLD.status;
  NEW.is_active                   := OLD.is_active;
  NEW.created_at                  := OLD.created_at;
  NEW.started_at                  := OLD.started_at;
  NEW.ended_at                    := OLD.ended_at;
  NEW.winner_id                   := OLD.winner_id;
  NEW.winner_username             := OLD.winner_username;
  NEW.winning_bid                 := OLD.winning_bid;
  NEW.starting_bid                := OLD.starting_bid;
  NEW.shipping_price              := OLD.shipping_price;
  NEW.shipping_method             := OLD.shipping_method;
  NEW.item_image_url              := OLD.item_image_url;
  NEW.thumbnail_url               := OLD.thumbnail_url;
  NEW.cf_playback_hls             := OLD.cf_playback_hls;
  NEW.cf_video_uid                := OLD.cf_video_uid;
  NEW.cf_whip_url                 := OLD.cf_whip_url;
  NEW.cf_live_input_id            := OLD.cf_live_input_id;
  NEW.cf_rtmps_url                := OLD.cf_rtmps_url;
  NEW.cf_stream_key               := OLD.cf_stream_key;
  NEW.break_mode                  := OLD.break_mode;
  NEW.quick_start_enabled         := OLD.quick_start_enabled;
  NEW.default_timer_sec           := OLD.default_timer_sec;
  NEW.default_starting_bid        := OLD.default_starting_bid;
  NEW.chat_slow_mode_sec          := OLD.chat_slow_mode_sec;
  NEW.sudden_death_enabled        := OLD.sudden_death_enabled;
  NEW.sudden_death_max_triggers   := OLD.sudden_death_max_triggers;
  NEW.sudden_death_seconds_added  := OLD.sudden_death_seconds_added;
  NEW.quantity                    := OLD.quantity;
  NEW.auction_reveal_mode         := OLD.auction_reveal_mode;

  -- Validate the only allowed change.
  IF NEW.current_bid IS DISTINCT FROM OLD.current_bid THEN
    IF OLD.current_bid IS NOT NULL AND NEW.current_bid <= OLD.current_bid THEN
      RAISE EXCEPTION 'New bid must exceed current bid';
    END IF;
    IF NEW.current_bidder_id IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'Bidder must be the authenticated user';
    END IF;
  ELSIF NEW.current_bidder_id IS DISTINCT FROM OLD.current_bidder_id THEN
    -- No bid change but bidder field changed -> reject
    RAISE EXCEPTION 'Cannot change current_bidder_id without raising the bid';
  END IF;

  RETURN NEW;
END;
$function$;

-- Tighten spin_wheels viewer update guard to a strict allowlist.
CREATE OR REPLACE FUNCTION public.spin_wheels_restrict_viewer_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid = OLD.seller_id THEN
    RETURN NEW;
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Viewers may ONLY flip is_spinning + set spin_started_at.
  -- Force every other column back to its previous value.
  NEW.id                          := OLD.id;
  NEW.stream_id                   := OLD.stream_id;
  NEW.seller_id                   := OLD.seller_id;
  NEW.title                       := OLD.title;
  NEW.mode                        := OLD.mode;
  NEW.spin_speed                  := OLD.spin_speed;
  NEW.viewer_can_spin             := OLD.viewer_can_spin;
  NEW.is_open                     := OLD.is_open;
  NEW.is_locked                   := OLD.is_locked;
  NEW.spin_ends_at                := OLD.spin_ends_at;
  NEW.spin_target_slot_id         := OLD.spin_target_slot_id;
  NEW.spin_seed                   := OLD.spin_seed;
  NEW.last_winner_username        := OLD.last_winner_username;
  NEW.last_winner_slot_label      := OLD.last_winner_slot_label;
  NEW.last_winner_at              := OLD.last_winner_at;
  NEW.pending_decision_slot_id    := OLD.pending_decision_slot_id;
  NEW.pending_decision_slot_label := OLD.pending_decision_slot_label;
  NEW.created_at                  := OLD.created_at;

  RETURN NEW;
END;
$function$;
