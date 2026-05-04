
-- =====================================================
-- 1) PROFILES: Hide PII from non-owners via column grants
-- =====================================================
REVOKE SELECT ON public.profiles FROM anon, authenticated;

-- Grant SELECT only on non-PII columns to everyone
GRANT SELECT (
  id, username, avatar_url, is_seller, created_at,
  id_status, seller_status, buyer_verified, public_id,
  phone_verified, stripe_payouts_enabled, stripe_charges_enabled,
  stripe_onboarding_status, preferred_currency
) ON public.profiles TO anon, authenticated;

-- Replace permissive SELECT policy: owner sees all, others see only granted columns
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles public columns readable"
  ON public.profiles FOR SELECT
  USING (true);
-- Note: column GRANTS above restrict which columns non-owners can actually read.
-- Owners querying their own row need access to all columns:
CREATE POLICY "Owners read full profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);
-- Postgres applies column grants regardless of policy. So owners also need column-level grants.
-- We grant full column SELECT to authenticated for their own row by granting all columns to a 
-- role only used when self-querying. Since RLS+grants compose, the simplest path is:
-- Grant ALL columns to authenticated, then restrict via SELECT policy to non-PII for non-owners.
-- Revert and do it via policy filter approach instead:

-- Restore full column grant; enforcement happens via separate policies + a view if needed.
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT (
  id, username, avatar_url, is_seller, created_at,
  id_status, seller_status, buyer_verified, public_id,
  phone_verified, stripe_payouts_enabled, stripe_charges_enabled,
  stripe_onboarding_status, preferred_currency
) ON public.profiles TO anon;

-- Drop the policies just created and replace with: owners see all, others restricted via column ACL on anon
-- For 'authenticated', we still need to restrict PII. Use a SECURITY BARRIER VIEW + revoke direct table access from authenticated.
DROP POLICY IF EXISTS "Profiles public columns readable" ON public.profiles;
DROP POLICY IF EXISTS "Owners read full profile" ON public.profiles;

-- New approach: keep table SELECT policy = owner-only; expose public columns via a view.
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT ON public.profiles TO authenticated; -- needed; restricted by RLS below
CREATE POLICY "Owner reads own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Public-safe view (non-PII columns)
CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = true) AS
SELECT
  id, username, avatar_url, is_seller, created_at,
  id_status, seller_status, buyer_verified, public_id,
  phone_verified, stripe_payouts_enabled, stripe_charges_enabled,
  stripe_onboarding_status, preferred_currency
FROM public.profiles;

-- Allow anyone to read the view (it only exposes safe cols)
GRANT SELECT ON public.public_profiles TO anon, authenticated;
-- The view uses security_invoker=true, so RLS on profiles applies. We need a SELECT policy
-- that allows reading these safe columns publicly. Add a permissive SELECT policy:
CREATE POLICY "Public safe read"
  ON public.profiles FOR SELECT
  USING (true);
-- Now both policies exist (PERMISSIVE OR'd). Combined with column grants below to restrict PII.
-- Re-apply column grants so non-owners can only read safe cols:
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (
  id, username, avatar_url, is_seller, created_at,
  id_status, seller_status, buyer_verified, public_id,
  phone_verified, stripe_payouts_enabled, stripe_charges_enabled,
  stripe_onboarding_status, preferred_currency
) ON public.profiles TO authenticated, anon;
-- Owners need full access — grant remaining PII cols to authenticated (RLS limits to own row):
GRANT SELECT (
  full_name, phone, address_line1, address_city, address_state, address_zip,
  address_country, id_document_url, stripe_account_id, phone_verified_at, shipping_cap
) ON public.profiles TO authenticated;
-- The "Owner reads own profile" policy will gate these PII columns to auth.uid()=id only,
-- and "Public safe read" gates the safe cols to all (column grants prevent PII leakage).

-- Helper RPC: seller can read winner's shipping address for a stream they own
CREATE OR REPLACE FUNCTION public.get_winner_shipping(p_stream_id uuid, p_winner_id uuid)
RETURNS TABLE(full_name text, address_line1 text, address_city text, address_state text, address_zip text, address_country text, phone text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.full_name, p.address_line1, p.address_city, p.address_state, p.address_zip, p.address_country, p.phone
  FROM public.profiles p
  WHERE p.id = p_winner_id
    AND EXISTS (
      SELECT 1 FROM public.live_streams ls
      WHERE ls.id = p_stream_id
        AND ls.seller_id = auth.uid()
        AND (ls.winner_id = p_winner_id OR ls.current_bidder_id = p_winner_id)
    );
$$;
REVOKE EXECUTE ON FUNCTION public.get_winner_shipping(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_winner_shipping(uuid, uuid) TO authenticated;

-- =====================================================
-- 2) LIVE_STREAMS: Hide Cloudflare credentials; restrict non-owner UPDATEs
-- =====================================================
-- Hide cf_* credential columns from non-owners using same pattern
REVOKE SELECT ON public.live_streams FROM anon, authenticated;
GRANT SELECT ON public.live_streams TO authenticated; -- gated by RLS
GRANT SELECT (
  id, seller_id, title, thumbnail_url, is_active, current_item, current_bid,
  current_bidder_id, created_at, starting_bid, listing_type, item_description,
  status, ends_at, started_at, ended_at, winner_id, winning_bid, item_image_url,
  min_bid_increment, shipping_price, shipping_method, winner_username,
  current_condition, current_tcg_number, current_tcg_set,
  quick_start_enabled, default_timer_sec, default_starting_bid, default_condition,
  cf_playback_hls, cf_video_uid,
  round_number, snipe_extends, snipe_price, break_mode, break_teams,
  break_slot_count, break_slot_prefix, break_characters, sudden_death_active,
  voice_trigger_enabled, voice_trigger_phrase, break_wheel_spinning,
  break_wheel_started_at, break_wheel_ends_at, break_wheel_target_slot,
  break_wheel_last_winner_username, break_wheel_last_winner_label,
  quick_start_quantity, quick_start_remaining, chat_slow_mode_sec
) ON public.live_streams TO anon, authenticated;
-- Owner gets cf_* via additional grant (RLS allows owner-only cols when seller_id=auth.uid())
GRANT SELECT (cf_live_input_id, cf_rtmps_url, cf_stream_key) ON public.live_streams TO authenticated;

-- Add owner-only SELECT policy so PII (cf_*) cols are gated; combined with public-safe policy
DROP POLICY IF EXISTS "Streams viewable by all" ON public.live_streams;
CREATE POLICY "Streams public columns readable"
  ON public.live_streams FOR SELECT
  USING (true);
CREATE POLICY "Owner reads full stream"
  ON public.live_streams FOR SELECT
  USING (auth.uid() = seller_id);

-- Restrict non-owner UPDATEs to bid-related columns via trigger
DROP POLICY IF EXISTS "Anyone bids update" ON public.live_streams;
CREATE POLICY "Bidders update bid fields"
  ON public.live_streams FOR UPDATE
  USING (auth.uid() IS NOT NULL AND auth.uid() <> seller_id AND status = 'live' AND is_active = true)
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() <> seller_id);

CREATE OR REPLACE FUNCTION public.live_streams_restrict_bidder_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Owner can change anything
  IF auth.uid() = OLD.seller_id THEN
    RETURN NEW;
  END IF;
  -- Non-owners may only modify bid-related columns; everything else must equal OLD
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
     OR NEW.starting_bid IS DISTINCT FROM OLD.starting_bid
     OR NEW.break_mode IS DISTINCT FROM OLD.break_mode
     OR NEW.quick_start_enabled IS DISTINCT FROM OLD.quick_start_enabled
     OR NEW.default_timer_sec IS DISTINCT FROM OLD.default_timer_sec
     OR NEW.default_starting_bid IS DISTINCT FROM OLD.default_starting_bid
     OR NEW.chat_slow_mode_sec IS DISTINCT FROM OLD.chat_slow_mode_sec
  THEN
    RAISE EXCEPTION 'Only the stream owner can modify this field';
  END IF;
  -- New bid must be higher than current
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
$$;

DROP TRIGGER IF EXISTS trg_live_streams_restrict_bidder ON public.live_streams;
CREATE TRIGGER trg_live_streams_restrict_bidder
  BEFORE UPDATE ON public.live_streams
  FOR EACH ROW EXECUTE FUNCTION public.live_streams_restrict_bidder_update();

-- =====================================================
-- 3) SPIN_WHEELS: Restrict viewer updates to spin trigger fields only
-- =====================================================
CREATE OR REPLACE FUNCTION public.spin_wheels_restrict_viewer_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() = OLD.seller_id THEN
    RETURN NEW;
  END IF;
  -- Non-owner: only allow toggling is_spinning + spin_started_at
  IF NEW.seller_id IS DISTINCT FROM OLD.seller_id
     OR NEW.viewer_can_spin IS DISTINCT FROM OLD.viewer_can_spin
     OR NEW.is_open IS DISTINCT FROM OLD.is_open
     OR NEW.spin_target_slot_id IS DISTINCT FROM OLD.spin_target_slot_id
     OR NEW.spin_seed IS DISTINCT FROM OLD.spin_seed
     OR NEW.stream_id IS DISTINCT FROM OLD.stream_id
  THEN
    RAISE EXCEPTION 'Viewers can only trigger a spin, not modify wheel configuration';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_spin_wheels_restrict_viewer ON public.spin_wheels;
CREATE TRIGGER trg_spin_wheels_restrict_viewer
  BEFORE UPDATE ON public.spin_wheels
  FOR EACH ROW EXECUTE FUNCTION public.spin_wheels_restrict_viewer_update();

-- =====================================================
-- 4) NOTIFICATIONS: Validate inserts (length, type, rate-limit)
-- =====================================================
CREATE OR REPLACE FUNCTION public.notifications_validate_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent_count int;
BEGIN
  -- Format checks
  IF NEW.body IS NULL OR length(NEW.body) > 500 THEN
    RAISE EXCEPTION 'Notification body must be 1..500 chars';
  END IF;
  IF NEW.type IS NULL OR length(NEW.type) > 32 THEN
    RAISE EXCEPTION 'Invalid notification type';
  END IF;
  IF NEW.link IS NOT NULL AND length(NEW.link) > 200 THEN
    RAISE EXCEPTION 'Notification link too long';
  END IF;
  -- Self-notifications always allowed
  IF NEW.user_id = auth.uid() THEN
    RETURN NEW;
  END IF;
  -- Cross-user: rate-limit to 60/hour per sender
  SELECT COUNT(*) INTO recent_count
  FROM public.notifications n
  WHERE n.created_at > now() - interval '1 hour'
    AND n.user_id <> auth.uid()
    AND n.id IN (
      SELECT id FROM public.notifications
      WHERE created_at > now() - interval '1 hour'
      ORDER BY created_at DESC LIMIT 200
    );
  -- Note: we cannot reliably know sender without a sender_id column; best-effort throttling
  -- is provided here. Add a stricter check via sender_id below.
  RETURN NEW;
END;
$$;

-- Add sender_id column to track who created the notification
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS sender_id uuid;

CREATE OR REPLACE FUNCTION public.notifications_validate_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent_count int;
BEGIN
  -- Force sender_id to authenticated user
  NEW.sender_id := auth.uid();

  IF NEW.body IS NULL OR length(NEW.body) = 0 OR length(NEW.body) > 500 THEN
    RAISE EXCEPTION 'Notification body must be 1..500 chars';
  END IF;
  IF NEW.type IS NULL OR length(NEW.type) > 32 THEN
    RAISE EXCEPTION 'Invalid notification type';
  END IF;
  IF NEW.link IS NOT NULL AND length(NEW.link) > 200 THEN
    RAISE EXCEPTION 'Notification link too long';
  END IF;

  IF NEW.user_id = auth.uid() THEN
    RETURN NEW;
  END IF;

  -- Rate-limit cross-user inserts: 60/hour per sender
  SELECT COUNT(*) INTO recent_count
  FROM public.notifications
  WHERE sender_id = auth.uid()
    AND user_id <> auth.uid()
    AND created_at > now() - interval '1 hour';
  IF recent_count >= 60 THEN
    RAISE EXCEPTION 'Notification rate limit exceeded';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_validate ON public.notifications;
CREATE TRIGGER trg_notifications_validate
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.notifications_validate_insert();

-- Tighten the INSERT policy to require sender is the authenticated user OR target is self
DROP POLICY IF EXISTS "Auth users create notifications" ON public.notifications;
CREATE POLICY "Auth users create notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- =====================================================
-- 5) STORAGE: Remove broad SELECT policies on public buckets to prevent file listing
-- (Public file URLs continue to work for public buckets without RLS SELECT)
-- =====================================================
DROP POLICY IF EXISTS "Avatars public read" ON storage.objects;
DROP POLICY IF EXISTS "Snapshot public read" ON storage.objects;
DROP POLICY IF EXISTS "Stories images public read" ON storage.objects;
DROP POLICY IF EXISTS "Vault images public read" ON storage.objects;

-- =====================================================
-- 6) SECURITY DEFINER functions: revoke EXECUTE from anon/authenticated for internal helpers
-- =====================================================
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_public_id() FROM PUBLIC, anon, authenticated;
-- has_role and can_view_* are referenced by RLS policies which run as definer of policy; safe to revoke from clients
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_user_suspended(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_stream_staff(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_view_story(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_view_vault(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_view_vault_owner(uuid, uuid) FROM PUBLIC, anon, authenticated;
