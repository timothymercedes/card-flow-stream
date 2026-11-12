ALTER TABLE public.auction_queue ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public';
COMMENT ON COLUMN public.auction_queue.visibility IS 'Queue publication scope: public items may be shown to visitors only while queued on a public live or scheduled show; private and draft items are excluded. Existing queue insertion publishes an item unless explicitly marked otherwise.';
CREATE OR REPLACE FUNCTION public.list_public_upcoming_queue(_stream_id uuid)
RETURNS TABLE(id uuid, stream_id uuid, "position" integer, title text, image_url text, description text, starting_bid numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT q.id,q.stream_id,q.position,q.title,q.image_url,q.description,q.starting_bid
 FROM public.auction_queue q JOIN public.live_streams s ON s.id=q.stream_id
 WHERE q.stream_id=_stream_id AND q.visibility='public' AND q.status='queued'
 AND q.sold_to IS NULL AND s.is_private IS FALSE AND s.status IN ('live','scheduled')
 ORDER BY q.position,q.id LIMIT 200
$$;
REVOKE ALL ON FUNCTION public.list_public_upcoming_queue(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_upcoming_queue(uuid) TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.list_public_upcoming_queue(uuid) IS 'Read-only visitor projection; no seller, winner, order, vault or moderation data. Existing base-table policies and signed-in access are unchanged.';