-- Stream payment activity log: tracks payment lifecycle events during a live stream
CREATE TABLE public.stream_payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  buyer_id uuid,
  buyer_username text,
  order_id uuid,
  event_type text NOT NULL,
  amount numeric,
  item_label text,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_stream_payment_events_stream ON public.stream_payment_events(stream_id, created_at DESC);

ALTER TABLE public.stream_payment_events ENABLE ROW LEVEL SECURITY;

-- Validate event_type via trigger (mutable values allowed for future)
CREATE OR REPLACE FUNCTION public.stream_payment_events_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.event_type NOT IN ('payment_pending','payment_paid','payment_declined','payment_recovered','payment_refunded','payment_failed','payment_retry') THEN
    RAISE EXCEPTION 'Invalid event_type: %', NEW.event_type;
  END IF;
  -- Auto-set seller_id from stream if missing
  IF NEW.seller_id IS NULL THEN
    SELECT seller_id INTO NEW.seller_id FROM public.live_streams WHERE id = NEW.stream_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_stream_payment_events_validate
BEFORE INSERT ON public.stream_payment_events
FOR EACH ROW EXECUTE FUNCTION public.stream_payment_events_validate();

-- Host/mods can view events for their stream
CREATE POLICY "Stream staff view payment events"
ON public.stream_payment_events FOR SELECT
USING (public.is_stream_staff(stream_id, auth.uid()));

-- Buyers can log their own payment events
CREATE POLICY "Buyer logs own payment event"
ON public.stream_payment_events FOR INSERT
WITH CHECK (auth.uid() = buyer_id);

-- Stream staff (host/mods) can log events too
CREATE POLICY "Stream staff log payment events"
ON public.stream_payment_events FOR INSERT
WITH CHECK (public.is_stream_staff(stream_id, auth.uid()));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.stream_payment_events;

-- ============================================================
-- User blocks (personal mute) + stream bans (host kicks user from their stream)
-- ============================================================
CREATE TABLE public.user_blocks (
  blocker_id uuid NOT NULL,
  blocked_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

-- Block target cannot be admin/owner
CREATE OR REPLACE FUNCTION public.user_blocks_protect_admins()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.blocker_id = NEW.blocked_id THEN
    RAISE EXCEPTION 'Cannot block yourself';
  END IF;
  IF public.has_role(NEW.blocked_id, 'admin') OR public.has_role(NEW.blocked_id, 'owner') THEN
    RAISE EXCEPTION 'Admins and the owner cannot be blocked';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_user_blocks_protect_admins
BEFORE INSERT ON public.user_blocks
FOR EACH ROW EXECUTE FUNCTION public.user_blocks_protect_admins();

CREATE POLICY "Users view own blocks"
ON public.user_blocks FOR SELECT
USING (auth.uid() = blocker_id);

CREATE POLICY "Users create own blocks"
ON public.user_blocks FOR INSERT
WITH CHECK (auth.uid() = blocker_id);

CREATE POLICY "Users delete own blocks"
ON public.user_blocks FOR DELETE
USING (auth.uid() = blocker_id);

-- Stream bans: host bans a user from their own live streams
CREATE TABLE public.stream_user_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id uuid NOT NULL,
  banned_user_id uuid NOT NULL,
  banned_by uuid NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stream_id, banned_user_id)
);

CREATE INDEX idx_stream_user_bans_stream ON public.stream_user_bans(stream_id);

ALTER TABLE public.stream_user_bans ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.stream_user_bans_protect_admins()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.has_role(NEW.banned_user_id, 'admin') OR public.has_role(NEW.banned_user_id, 'owner') THEN
    RAISE EXCEPTION 'Admins and the owner cannot be banned';
  END IF;
  IF NEW.banned_user_id = NEW.banned_by THEN
    RAISE EXCEPTION 'Cannot ban yourself';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_stream_user_bans_protect_admins
BEFORE INSERT ON public.stream_user_bans
FOR EACH ROW EXECUTE FUNCTION public.stream_user_bans_protect_admins();

-- Anyone can read bans (used to enforce client-side hiding); banned users themselves see they're banned
CREATE POLICY "Bans viewable by all"
ON public.stream_user_bans FOR SELECT
USING (true);

-- Only stream staff can ban
CREATE POLICY "Stream staff ban users"
ON public.stream_user_bans FOR INSERT
WITH CHECK (auth.uid() = banned_by AND public.is_stream_staff(stream_id, auth.uid()));

CREATE POLICY "Stream staff unban users"
ON public.stream_user_bans FOR DELETE
USING (public.is_stream_staff(stream_id, auth.uid()));

-- ============================================================
-- Admin signup stats helper
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_get_signup_stats()
RETURNS TABLE(total bigint, last_24h bigint, last_7d bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (SELECT COUNT(*) FROM public.profiles)::bigint AS total,
    (SELECT COUNT(*) FROM public.profiles WHERE created_at > now() - interval '24 hours')::bigint AS last_24h,
    (SELECT COUNT(*) FROM public.profiles WHERE created_at > now() - interval '7 days')::bigint AS last_7d
  WHERE public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner');
$$;

CREATE OR REPLACE FUNCTION public.admin_list_recent_signups(_limit int DEFAULT 50)
RETURNS TABLE(id uuid, username text, avatar_url text, is_seller boolean, seller_status text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, username, avatar_url, is_seller, seller_status, created_at
  FROM public.profiles
  WHERE public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner')
  ORDER BY created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 200));
$$;