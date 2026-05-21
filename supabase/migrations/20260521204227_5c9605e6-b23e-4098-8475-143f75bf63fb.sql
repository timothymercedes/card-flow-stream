
ALTER TABLE public.shipping_scans
  ADD COLUMN IF NOT EXISTS carrier text,
  ADD COLUMN IF NOT EXISTS suggested_status text,
  ADD COLUMN IF NOT EXISTS ai_confidence numeric,
  ADD COLUMN IF NOT EXISTS ai_metadata jsonb;

-- Apply an AI-detected shipment scan. Caller passes the parsed tracking
-- number plus the status the AI inferred from the photo (label_created,
-- ready_for_dropoff, shipped, delivered). We match against the seller's
-- orders and advance — never downgrade — the prep_status.
CREATE OR REPLACE FUNCTION public.apply_ai_shipment_scan(
  _code text,
  _kind text DEFAULT 'photo',
  _suggested_status text DEFAULT 'ready_for_dropoff',
  _carrier text DEFAULT NULL,
  _confidence numeric DEFAULT NULL,
  _metadata jsonb DEFAULT NULL
)
RETURNS TABLE(order_id uuid, prev_status text, new_status text, result text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order_id uuid; v_seller uuid; v_prev text; v_new text; v_rank int; v_prev_rank int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;

  -- Normalize status
  IF _suggested_status NOT IN ('label_created','ready_for_dropoff','shipped','delivered') THEN
    _suggested_status := 'ready_for_dropoff';
  END IF;

  -- Try exact tracking number match
  SELECT o.id, o.seller_id, o.prep_status
    INTO v_order_id, v_seller, v_prev
    FROM public.orders o
    WHERE o.tracking_number = _code
    ORDER BY o.created_at DESC LIMIT 1;

  -- Fallback: prefix match for partial OCR reads (>= 10 chars)
  IF v_order_id IS NULL AND length(_code) >= 10 THEN
    SELECT o.id, o.seller_id, o.prep_status
      INTO v_order_id, v_seller, v_prev
      FROM public.orders o
      WHERE o.tracking_number IS NOT NULL
        AND (o.tracking_number ILIKE _code || '%' OR _code ILIKE o.tracking_number || '%')
        AND o.seller_id = auth.uid()
      ORDER BY o.created_at DESC LIMIT 1;
  END IF;

  IF v_order_id IS NULL THEN
    INSERT INTO public.shipping_scans(order_id, scanned_by, code, kind, result, carrier, suggested_status, ai_confidence, ai_metadata)
      VALUES (NULL, auth.uid(), _code, _kind, 'unmatched', _carrier, _suggested_status, _confidence, _metadata);
    order_id := NULL; prev_status := NULL; new_status := NULL; result := 'unmatched';
    RETURN NEXT; RETURN;
  END IF;

  IF v_seller <> auth.uid() THEN
    INSERT INTO public.shipping_scans(order_id, scanned_by, code, kind, result, carrier, suggested_status, ai_confidence, ai_metadata)
      VALUES (v_order_id, auth.uid(), _code, _kind, 'mismatch', _carrier, _suggested_status, _confidence, _metadata);
    order_id := v_order_id; prev_status := v_prev; new_status := v_prev; result := 'mismatch';
    RETURN NEXT; RETURN;
  END IF;

  -- Never downgrade. Rank statuses.
  v_prev_rank := CASE COALESCE(v_prev,'label_pending')
    WHEN 'label_pending' THEN 0 WHEN 'label_created' THEN 1
    WHEN 'prepared' THEN 2 WHEN 'packed' THEN 3
    WHEN 'ready_for_dropoff' THEN 4 WHEN 'shipped' THEN 5
    WHEN 'delivered' THEN 6 ELSE 0 END;
  v_rank := CASE _suggested_status
    WHEN 'label_created' THEN 1 WHEN 'ready_for_dropoff' THEN 4
    WHEN 'shipped' THEN 5 WHEN 'delivered' THEN 6 ELSE 4 END;
  v_new := CASE WHEN v_rank > v_prev_rank THEN _suggested_status ELSE v_prev END;

  UPDATE public.orders
    SET prep_status = v_new,
        tracking_number = COALESCE(tracking_number, _code),
        carrier = COALESCE(carrier, _carrier),
        packed_at = COALESCE(packed_at, CASE WHEN v_new IN ('packed','ready_for_dropoff','shipped','delivered') THEN now() END),
        ready_at = COALESCE(ready_at, CASE WHEN v_new IN ('ready_for_dropoff','shipped','delivered') THEN now() END),
        dropoff_scanned_at = COALESCE(dropoff_scanned_at, CASE WHEN v_new IN ('shipped','delivered') THEN now() END),
        shipped_at = COALESCE(shipped_at, CASE WHEN v_new IN ('shipped','delivered') THEN now() END),
        delivered_at = COALESCE(delivered_at, CASE WHEN v_new = 'delivered' THEN now() END)
    WHERE id = v_order_id;

  INSERT INTO public.shipping_scans(order_id, scanned_by, code, kind, result, prev_status, new_status, carrier, suggested_status, ai_confidence, ai_metadata)
    VALUES (v_order_id, auth.uid(), _code, _kind, 'matched', v_prev, v_new, _carrier, _suggested_status, _confidence, _metadata);

  order_id := v_order_id; prev_status := v_prev; new_status := v_new; result := 'matched';
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_ai_shipment_scan(text, text, text, text, numeric, jsonb) TO authenticated;
