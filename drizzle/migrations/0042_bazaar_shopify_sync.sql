CREATE OR REPLACE FUNCTION public.bazaar_apply_shopify_sync(_supplier_id uuid, _rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE _now timestamptz := now(); _ok int; _out int; _gone int; _pub int; _unpub int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.bazaar_suppliers WHERE id = _supplier_id AND name = 'Shopify' AND is_demo = false) THEN
    RAISE EXCEPTION 'Not the Shopify supplier';
  END IF;
  CREATE TEMP TABLE _s ON COMMIT DROP AS
    SELECT l.id link_id, l.variant_id, l.product_id, (r->>'found')::boolean found,
           (r->>'cost')::int cost, GREATEST(0, COALESCE((r->>'qty')::int, 0)) qty, (r->>'price')::int price
    FROM jsonb_array_elements(_rows) r
    JOIN public.bazaar_supplier_product_links l ON l.id = (r->>'link_id')::uuid AND l.supplier_id = _supplier_id;

  UPDATE public.bazaar_product_variants v SET
    price_cents = CASE WHEN s.found THEN s.price ELSE v.price_cents END,
    quantity = CASE WHEN s.found THEN s.qty ELSE 0 END,
    is_active = s.found AND s.qty > 0
  FROM _s s WHERE v.id = s.variant_id;

  UPDATE public.bazaar_supplier_product_links l SET
    supplier_cost_cents = CASE WHEN s.found THEN s.cost ELSE l.supplier_cost_cents END,
    computed_price_cents = CASE WHEN s.found THEN s.price ELSE l.computed_price_cents END,
    margin_cents = CASE WHEN s.found THEN floor(s.price * 0.971 - s.cost - 30)::int ELSE l.margin_cents END,
    below_floor = CASE WHEN s.found THEN (s.price * 0.971 - s.cost - 30) < 300 ELSE l.below_floor END,
    supplier_stock = CASE WHEN s.found THEN s.qty ELSE 0 END,
    last_synced_at = _now,
    review_status = CASE WHEN s.found AND s.qty > 0 AND (s.price * 0.971 - s.cost - 30) >= 300 THEN 'approved' ELSE l.review_status END,
    sync_status = CASE WHEN NOT s.found THEN 'discontinued'
                       WHEN s.qty > 0 AND (s.price * 0.971 - s.cost - 30) >= 300 THEN 'ok' ELSE 'unverified' END
  FROM _s s WHERE l.id = s.link_id;

  SELECT count(*) FILTER (WHERE found AND qty > 0), count(*) FILTER (WHERE found AND qty = 0), count(*) FILTER (WHERE NOT found) INTO _ok, _out, _gone FROM _s;

  WITH p AS (SELECT DISTINCT product_id FROM _s)
  UPDATE public.bazaar_products bp SET status = 'published', published_at = COALESCE(bp.published_at, _now)
  FROM p WHERE bp.id = p.product_id AND bp.status <> 'published'
    AND EXISTS (SELECT 1 FROM public.bazaar_supplier_product_links l JOIN public.bazaar_product_variants v ON v.id = l.variant_id
                WHERE l.product_id = bp.id AND l.review_status = 'approved' AND l.sync_status = 'ok' AND v.is_active);
  GET DIAGNOSTICS _pub = ROW_COUNT;

  WITH p AS (SELECT DISTINCT product_id FROM _s)
  UPDATE public.bazaar_products bp SET status = 'draft'
  FROM p WHERE bp.id = p.product_id AND bp.status = 'published'
    AND NOT EXISTS (SELECT 1 FROM public.bazaar_supplier_product_links l JOIN public.bazaar_product_variants v ON v.id = l.variant_id
                WHERE l.product_id = bp.id AND l.review_status = 'approved' AND l.sync_status = 'ok' AND v.is_active);
  GET DIAGNOSTICS _unpub = ROW_COUNT;

  RETURN jsonb_build_object('in_stock', _ok, 'sold_out', _out, 'removed', _gone, 'published', _pub, 'unpublished', _unpub);
END $$;
REVOKE ALL ON FUNCTION public.bazaar_apply_shopify_sync(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bazaar_apply_shopify_sync(uuid, jsonb) TO service_role;