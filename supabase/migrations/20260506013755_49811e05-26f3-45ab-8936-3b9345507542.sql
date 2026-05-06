CREATE TABLE public.stream_tips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  buyer_id uuid NOT NULL,
  buyer_username text NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 2),
  message text,
  status text NOT NULL DEFAULT 'pending',
  stripe_payment_intent_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

CREATE INDEX idx_stream_tips_stream ON public.stream_tips(stream_id, created_at DESC);
CREATE INDEX idx_stream_tips_seller ON public.stream_tips(seller_id, created_at DESC);

ALTER TABLE public.stream_tips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tips viewable by all"
  ON public.stream_tips FOR SELECT USING (true);

CREATE POLICY "Buyers create own tips"
  ON public.stream_tips FOR INSERT
  WITH CHECK (auth.uid() = buyer_id AND amount >= 2);

CREATE POLICY "Buyers update own tips"
  ON public.stream_tips FOR UPDATE USING (auth.uid() = buyer_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.stream_tips;