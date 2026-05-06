
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS live_verified boolean NOT NULL DEFAULT false;

ALTER TABLE public.live_streams
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'auction',
  ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_collab_requests boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_collab_count integer NOT NULL DEFAULT 4;

CREATE TABLE IF NOT EXISTS public.stream_collab_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id uuid NOT NULL,
  host_id uuid NOT NULL,
  requester_id uuid NOT NULL,
  requester_username text NOT NULL,
  requester_avatar_url text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE (stream_id, requester_id)
);

ALTER TABLE public.stream_collab_join_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users request to join open collab"
  ON public.stream_collab_join_requests FOR INSERT
  WITH CHECK (
    auth.uid() = requester_id
    AND requester_id <> host_id
    AND EXISTS (
      SELECT 1 FROM public.live_streams ls
      WHERE ls.id = stream_id
        AND ls.seller_id = host_id
        AND ls.status = 'live'
        AND ls.allow_collab_requests = true
    )
  );

CREATE POLICY "Request parties view"
  ON public.stream_collab_join_requests FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = host_id);

CREATE POLICY "Host responds to join requests"
  ON public.stream_collab_join_requests FOR UPDATE
  USING (auth.uid() = host_id);

-- When a join request is accepted, add the requester to stream_moderators (mirrors existing invite flow)
CREATE OR REPLACE FUNCTION public.collab_join_request_apply_accept()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'accepted' AND COALESCE(OLD.status,'') <> 'accepted' THEN
    INSERT INTO public.stream_moderators (stream_id, mod_user_id, mod_username, host_id)
    VALUES (NEW.stream_id, NEW.requester_id, NEW.requester_username, NEW.host_id)
    ON CONFLICT DO NOTHING;
    NEW.responded_at := now();
  ELSIF NEW.status = 'declined' AND COALESCE(OLD.status,'') <> 'declined' THEN
    NEW.responded_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS collab_join_request_apply_accept_trg ON public.stream_collab_join_requests;
CREATE TRIGGER collab_join_request_apply_accept_trg
  BEFORE UPDATE ON public.stream_collab_join_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.collab_join_request_apply_accept();

ALTER PUBLICATION supabase_realtime ADD TABLE public.stream_collab_join_requests;
