
-- Local timestamp helper (idempotent)
CREATE OR REPLACE FUNCTION public.set_updated_at_now()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TABLE public.notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  push_enabled boolean NOT NULL DEFAULT true,
  inapp_enabled boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT false,
  cat_live boolean NOT NULL DEFAULT true,
  cat_bids boolean NOT NULL DEFAULT true,
  cat_orders boolean NOT NULL DEFAULT true,
  cat_social boolean NOT NULL DEFAULT true,
  cat_seller boolean NOT NULL DEFAULT true,
  cat_system boolean NOT NULL DEFAULT true,
  quiet_start time,
  quiet_end time,
  timezone text NOT NULL DEFAULT 'UTC',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own prefs" ON public.notification_preferences
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users insert own prefs" ON public.notification_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own prefs" ON public.notification_preferences
  FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER trg_notification_prefs_updated
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();

CREATE OR REPLACE FUNCTION public.create_default_notification_prefs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notification_preferences (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created_prefs ON auth.users;
CREATE TRIGGER on_auth_user_created_prefs
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_default_notification_prefs();

INSERT INTO public.notification_preferences (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_notify_targets(_user_ids uuid[], _category text)
RETURNS TABLE(user_id uuid, allow_push boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.user_id,
    (
      p.push_enabled
      AND CASE
        WHEN p.quiet_start IS NULL OR p.quiet_end IS NULL THEN true
        ELSE NOT (
          CASE
            WHEN p.quiet_start <= p.quiet_end THEN
              ((now() AT TIME ZONE p.timezone)::time) BETWEEN p.quiet_start AND p.quiet_end
            ELSE
              ((now() AT TIME ZONE p.timezone)::time) >= p.quiet_start
              OR ((now() AT TIME ZONE p.timezone)::time) <= p.quiet_end
          END
        )
      END
    ) AS allow_push
  FROM public.notification_preferences p
  WHERE p.user_id = ANY(_user_ids)
    AND p.inapp_enabled
    AND CASE _category
      WHEN 'live' THEN p.cat_live
      WHEN 'bids' THEN p.cat_bids
      WHEN 'orders' THEN p.cat_orders
      WHEN 'social' THEN p.cat_social
      WHEN 'seller' THEN p.cat_seller
      WHEN 'system' THEN p.cat_system
      ELSE true
    END;
END $$;

GRANT EXECUTE ON FUNCTION public.get_notify_targets(uuid[], text) TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.notify_user(
  _user_id uuid, _type text, _category text, _body text, _link text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _allowed boolean; _id uuid;
BEGIN
  IF _user_id IS NULL THEN RETURN NULL; END IF;
  SELECT TRUE INTO _allowed FROM public.get_notify_targets(ARRAY[_user_id], _category) LIMIT 1;
  IF NOT COALESCE(_allowed, false) THEN RETURN NULL; END IF;
  INSERT INTO public.notifications (user_id, type, body, link)
  VALUES (_user_id, _type, _body, _link)
  RETURNING id INTO _id;
  RETURN _id;
END $$;

-- Outbid trigger
CREATE OR REPLACE FUNCTION public.notify_listing_outbid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _prev_bidder uuid; _title text;
BEGIN
  SELECT user_id INTO _prev_bidder
  FROM public.listing_bids
  WHERE listing_id = NEW.listing_id
    AND user_id <> NEW.user_id
    AND amount < NEW.amount
  ORDER BY amount DESC, created_at DESC
  LIMIT 1;
  IF _prev_bidder IS NOT NULL THEN
    SELECT title INTO _title FROM public.listings WHERE id = NEW.listing_id;
    PERFORM public.notify_user(
      _prev_bidder, 'outbid', 'bids',
      'You were outbid on "' || COALESCE(_title, 'a listing') || '" — new bid $' || NEW.amount::text,
      '/market/' || NEW.listing_id::text
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_listing_bid_outbid ON public.listing_bids;
CREATE TRIGGER trg_listing_bid_outbid
  AFTER INSERT ON public.listing_bids
  FOR EACH ROW EXECUTE FUNCTION public.notify_listing_outbid();

-- Order status trigger
CREATE OR REPLACE FUNCTION public.notify_order_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'shipped' THEN
      PERFORM public.notify_user(NEW.buyer_id, 'order_shipped', 'orders',
        'Your order "' || NEW.title || '" shipped' ||
          CASE WHEN NEW.tracking_number IS NOT NULL THEN ' — tracking ' || NEW.tracking_number ELSE '' END,
        '/orders');
    ELSIF NEW.status = 'delivered' THEN
      PERFORM public.notify_user(NEW.buyer_id, 'order_delivered', 'orders',
        'Your order "' || NEW.title || '" was delivered', '/orders');
    ELSIF NEW.status = 'cancelled' THEN
      PERFORM public.notify_user(NEW.buyer_id, 'order_cancelled', 'orders',
        'Your order "' || NEW.title || '" was cancelled', '/orders');
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_order_status_notify ON public.orders;
CREATE TRIGGER trg_order_status_notify
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_order_status();

-- New follower trigger
CREATE OR REPLACE FUNCTION public.notify_new_follower()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _follower_name text;
BEGIN
  SELECT username INTO _follower_name FROM public.profiles WHERE id = NEW.follower_id;
  PERFORM public.notify_user(
    NEW.followee_id, 'new_follower', 'social',
    COALESCE(_follower_name, 'Someone') || ' followed you',
    '/seller/' || COALESCE(_follower_name, NEW.follower_id::text)
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_new_follower_notify ON public.follows;
CREATE TRIGGER trg_new_follower_notify
  AFTER INSERT ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_follower();
