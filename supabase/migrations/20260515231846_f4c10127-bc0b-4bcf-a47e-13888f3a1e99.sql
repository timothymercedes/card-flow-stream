
-- ============== STREAM SUPPORTER LEADERBOARDS ==============
CREATE OR REPLACE VIEW public.stream_supporters AS
SELECT
  t.stream_id,
  t.seller_id,
  t.buyer_id,
  t.buyer_username,
  COUNT(*)::int AS tip_count,
  COALESCE(SUM(t.amount), 0)::numeric AS total_tipped,
  MAX(t.created_at) AS last_tip_at
FROM public.stream_tips t
WHERE t.status = 'paid'
GROUP BY t.stream_id, t.seller_id, t.buyer_id, t.buyer_username;

GRANT SELECT ON public.stream_supporters TO anon, authenticated;

-- ============== FAVORITE SELLER LIVE NOTIFICATIONS ==============
CREATE OR REPLACE FUNCTION public.notify_followers_on_live()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seller_name text;
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.is_active = true AND NEW.status = 'live')
     OR (TG_OP = 'UPDATE' AND OLD.is_active = false AND NEW.is_active = true AND NEW.status = 'live') THEN
    SELECT username INTO seller_name FROM public.profiles WHERE id = NEW.seller_id;
    INSERT INTO public.notifications (user_id, type, body, link, sender_id)
    SELECT f.follower_id,
           'seller_live',
           COALESCE(seller_name, 'A seller you follow') || ' is live: ' || NEW.title,
           '/live/' || NEW.id,
           NEW.seller_id
    FROM public.follows f
    WHERE f.followee_id = NEW.seller_id AND f.notify_on_live = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_followers_on_live ON public.live_streams;
CREATE TRIGGER trg_notify_followers_on_live
AFTER INSERT OR UPDATE OF is_active, status ON public.live_streams
FOR EACH ROW EXECUTE FUNCTION public.notify_followers_on_live();

-- ============== SHIPPING PREP + SCAN WORKFLOW ==============
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS prep_status text NOT NULL DEFAULT 'label_pending',
  ADD COLUMN IF NOT EXISTS packed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS dropoff_scanned_at timestamptz;

-- valid: label_pending, label_created, prepared, packed, ready_for_dropoff, shipped, delivered
CREATE INDEX IF NOT EXISTS idx_orders_seller_prep ON public.orders(seller_id, prep_status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.shipping_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  scanned_by uuid NOT NULL,
  code text NOT NULL,
  kind text NOT NULL DEFAULT 'tracking',
  result text NOT NULL DEFAULT 'matched',
  prev_status text,
  new_status text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shipping_scans_order ON public.shipping_scans(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shipping_scans_scanner ON public.shipping_scans(scanned_by, created_at DESC);

ALTER TABLE public.shipping_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers view scans for their orders"
  ON public.shipping_scans FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = shipping_scans.order_id AND o.seller_id = auth.uid())
         OR scanned_by = auth.uid()
         OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Sellers insert scans for their orders"
  ON public.shipping_scans FOR INSERT TO authenticated
  WITH CHECK (scanned_by = auth.uid()
              AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.seller_id = auth.uid()));

-- mark order packed
CREATE OR REPLACE FUNCTION public.mark_order_packed(_order_id uuid)
RETURNS TABLE(prev_status text, new_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_seller uuid; v_prev text;
BEGIN
  SELECT seller_id, prep_status INTO v_seller, v_prev FROM public.orders WHERE id = _order_id;
  IF v_seller IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_seller <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.orders
    SET prep_status = 'packed', packed_at = COALESCE(packed_at, now())
    WHERE id = _order_id AND prep_status NOT IN ('shipped','delivered');
  prev_status := v_prev; new_status := 'packed';
  RETURN NEXT;
END;
$$;

-- mark ready for dropoff
CREATE OR REPLACE FUNCTION public.mark_order_ready(_order_id uuid)
RETURNS TABLE(prev_status text, new_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_seller uuid; v_prev text;
BEGIN
  SELECT seller_id, prep_status INTO v_seller, v_prev FROM public.orders WHERE id = _order_id;
  IF v_seller IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_seller <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.orders
    SET prep_status = 'ready_for_dropoff',
        ready_at = COALESCE(ready_at, now()),
        packed_at = COALESCE(packed_at, now())
    WHERE id = _order_id AND prep_status NOT IN ('shipped','delivered');
  prev_status := v_prev; new_status := 'ready_for_dropoff';
  RETURN NEXT;
END;
$$;

-- register a shipping scan: tries to match by tracking_number, then by order id substring
CREATE OR REPLACE FUNCTION public.register_shipping_scan(_code text, _kind text DEFAULT 'tracking')
RETURNS TABLE(order_id uuid, prev_status text, new_status text, result text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order_id uuid; v_seller uuid; v_prev text; v_new text; v_result text;
BEGIN
  -- Try match: exact tracking number
  SELECT o.id, o.seller_id, o.prep_status
    INTO v_order_id, v_seller, v_prev
    FROM public.orders o
    WHERE o.tracking_number = _code
    ORDER BY o.created_at DESC LIMIT 1;

  -- Fallback: by order short id (first 8 chars)
  IF v_order_id IS NULL AND length(_code) >= 8 THEN
    SELECT o.id, o.seller_id, o.prep_status
      INTO v_order_id, v_seller, v_prev
      FROM public.orders o
      WHERE substr(o.id::text,1,8) = lower(substr(_code,1,8))
        AND o.seller_id = auth.uid()
      LIMIT 1;
  END IF;

  IF v_order_id IS NULL THEN
    INSERT INTO public.shipping_scans(order_id, scanned_by, code, kind, result)
      VALUES (NULL, auth.uid(), _code, _kind, 'unmatched');
    order_id := NULL; prev_status := NULL; new_status := NULL; result := 'unmatched';
    RETURN NEXT; RETURN;
  END IF;

  IF v_seller <> auth.uid() THEN
    INSERT INTO public.shipping_scans(order_id, scanned_by, code, kind, result)
      VALUES (v_order_id, auth.uid(), _code, _kind, 'mismatch');
    order_id := v_order_id; prev_status := v_prev; new_status := v_prev; result := 'mismatch';
    RETURN NEXT; RETURN;
  END IF;

  -- advance status
  v_new := CASE
    WHEN v_prev IN ('shipped','delivered') THEN v_prev
    WHEN v_prev = 'ready_for_dropoff' THEN 'ready_for_dropoff'
    ELSE 'ready_for_dropoff'
  END;

  UPDATE public.orders
    SET prep_status = v_new,
        ready_at = COALESCE(ready_at, now()),
        packed_at = COALESCE(packed_at, now()),
        dropoff_scanned_at = COALESCE(dropoff_scanned_at, now())
    WHERE id = v_order_id;

  v_result := 'matched';
  INSERT INTO public.shipping_scans(order_id, scanned_by, code, kind, result, prev_status, new_status)
    VALUES (v_order_id, auth.uid(), _code, _kind, v_result, v_prev, v_new);

  order_id := v_order_id; prev_status := v_prev; new_status := v_new; result := v_result;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_order_packed(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_order_ready(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_shipping_scan(text, text) TO authenticated;

-- buyer notifications on prep_status transitions
CREATE OR REPLACE FUNCTION public.notify_buyer_on_prep_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  msg text;
BEGIN
  IF NEW.prep_status IS DISTINCT FROM OLD.prep_status THEN
    msg := CASE NEW.prep_status
      WHEN 'packed' THEN 'Your order has been packed: ' || NEW.title
      WHEN 'ready_for_dropoff' THEN 'Your order is ready for shipment: ' || NEW.title
      WHEN 'shipped' THEN 'Your package has been shipped: ' || NEW.title
      ELSE NULL
    END;
    IF msg IS NOT NULL THEN
      INSERT INTO public.notifications(user_id, type, body, link, sender_id)
        VALUES (NEW.buyer_id, 'order_' || NEW.prep_status, msg, '/orders', NEW.seller_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_buyer_on_prep_change ON public.orders;
CREATE TRIGGER trg_notify_buyer_on_prep_change
AFTER UPDATE OF prep_status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.notify_buyer_on_prep_change();

-- ============== COMBO STREAKS ==============
CREATE TABLE IF NOT EXISTS public.user_combo_streaks (
  user_id uuid NOT NULL,
  stream_id uuid NOT NULL,
  combo_count int NOT NULL DEFAULT 0,
  best_combo int NOT NULL DEFAULT 0,
  last_bid_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, stream_id)
);
ALTER TABLE public.user_combo_streaks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Combo streaks viewable in stream"
  ON public.user_combo_streaks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own combo streaks"
  ON public.user_combo_streaks FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.bump_combo_streak(_stream_id uuid)
RETURNS TABLE(combo_count int, best_combo int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prev int := 0; v_last timestamptz; v_new int; v_best int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT cs.combo_count, cs.last_bid_at, cs.best_combo
    INTO v_prev, v_last, v_best
    FROM public.user_combo_streaks cs
    WHERE cs.user_id = v_uid AND cs.stream_id = _stream_id;

  IF v_last IS NULL OR (now() - v_last) > interval '20 seconds' THEN
    v_new := 1;
  ELSE
    v_new := COALESCE(v_prev,0) + 1;
  END IF;

  v_best := GREATEST(COALESCE(v_best,0), v_new);

  INSERT INTO public.user_combo_streaks(user_id, stream_id, combo_count, best_combo, last_bid_at)
    VALUES (v_uid, _stream_id, v_new, v_best, now())
    ON CONFLICT (user_id, stream_id) DO UPDATE
      SET combo_count = EXCLUDED.combo_count,
          best_combo = GREATEST(public.user_combo_streaks.best_combo, EXCLUDED.combo_count),
          last_bid_at = now();

  combo_count := v_new; best_combo := v_best;
  RETURN NEXT;
END;
$$;
GRANT EXECUTE ON FUNCTION public.bump_combo_streak(uuid) TO authenticated;

-- ============== USER UI PREFS ==============
CREATE TABLE IF NOT EXISTS public.user_ui_prefs (
  user_id uuid PRIMARY KEY,
  reduce_motion boolean NOT NULL DEFAULT false,
  sfx_muted boolean NOT NULL DEFAULT false,
  haptics boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_ui_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own ui prefs" ON public.user_ui_prefs
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users upsert own ui prefs" ON public.user_ui_prefs
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_combo_streaks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shipping_scans;
