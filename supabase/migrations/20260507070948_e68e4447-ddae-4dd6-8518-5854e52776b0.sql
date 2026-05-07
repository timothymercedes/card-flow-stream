ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_failure_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_retry_deadline timestamptz;

CREATE TABLE IF NOT EXISTS public.live_bid_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id uuid NOT NULL,
  user_id uuid NOT NULL,
  reason text,
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stream_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_live_bid_blocks_user ON public.live_bid_blocks(user_id);
CREATE INDEX IF NOT EXISTS idx_live_bid_blocks_stream ON public.live_bid_blocks(stream_id);

ALTER TABLE public.live_bid_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blocks_host_select" ON public.live_bid_blocks;
CREATE POLICY "blocks_host_select" ON public.live_bid_blocks FOR SELECT
USING (
  EXISTS (SELECT 1 FROM public.live_streams ls WHERE ls.id = stream_id AND ls.seller_id = auth.uid())
  OR user_id = auth.uid()
  OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'moderator')
);

DROP POLICY IF EXISTS "blocks_host_insert" ON public.live_bid_blocks;
CREATE POLICY "blocks_host_insert" ON public.live_bid_blocks FOR INSERT
WITH CHECK (
  EXISTS (SELECT 1 FROM public.live_streams ls WHERE ls.id = stream_id AND ls.seller_id = auth.uid())
  OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')
);

DROP POLICY IF EXISTS "blocks_host_delete" ON public.live_bid_blocks;
CREATE POLICY "blocks_host_delete" ON public.live_bid_blocks FOR DELETE
USING (
  EXISTS (SELECT 1 FROM public.live_streams ls WHERE ls.id = stream_id AND ls.seller_id = auth.uid())
  OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')
);

CREATE OR REPLACE FUNCTION public.is_bid_blocked(_stream_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.live_bid_blocks
    WHERE stream_id = _stream_id
      AND user_id = _user_id
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;