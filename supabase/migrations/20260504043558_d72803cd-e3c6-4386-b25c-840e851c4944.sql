
CREATE TABLE IF NOT EXISTS public.message_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  sender_username text NOT NULL,
  recipient_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  last_request_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sender_id, recipient_id)
);

ALTER TABLE public.message_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Request parties view"
ON public.message_requests FOR SELECT
USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

CREATE POLICY "Senders create requests"
ON public.message_requests FOR INSERT
WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Recipients update requests"
ON public.message_requests FOR UPDATE
USING (auth.uid() = recipient_id);

CREATE POLICY "Senders re-request"
ON public.message_requests FOR UPDATE
USING (auth.uid() = sender_id);
