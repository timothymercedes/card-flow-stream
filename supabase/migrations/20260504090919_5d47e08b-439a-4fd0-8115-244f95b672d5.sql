
CREATE TABLE public.stream_shoutouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  buyer_id uuid NOT NULL,
  buyer_username text NOT NULL,
  message text NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 5 AND amount <= 50),
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

CREATE INDEX idx_shoutouts_stream ON public.stream_shoutouts(stream_id, created_at DESC);
CREATE INDEX idx_shoutouts_buyer_stream ON public.stream_shoutouts(buyer_id, stream_id);

ALTER TABLE public.stream_shoutouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Shoutouts viewable by all"
  ON public.stream_shoutouts FOR SELECT USING (true);

CREATE POLICY "Buyers create own shoutouts"
  ON public.stream_shoutouts FOR INSERT
  WITH CHECK (auth.uid() = buyer_id AND amount >= 5 AND amount <= 50);

CREATE POLICY "Buyers update own shoutouts"
  ON public.stream_shoutouts FOR UPDATE
  USING (auth.uid() = buyer_id);

-- Enforce $50 lifetime cap per buyer per stream
CREATE OR REPLACE FUNCTION public.enforce_shoutout_cap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE total numeric;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO total
  FROM public.stream_shoutouts
  WHERE buyer_id = NEW.buyer_id AND stream_id = NEW.stream_id;
  IF (total + NEW.amount) > 50 THEN
    RAISE EXCEPTION 'Shout-out cap reached: $50 per stream (you have $% remaining)', GREATEST(0, 50 - total);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_shoutout_cap
BEFORE INSERT ON public.stream_shoutouts
FOR EACH ROW EXECUTE FUNCTION public.enforce_shoutout_cap();

ALTER PUBLICATION supabase_realtime ADD TABLE public.stream_shoutouts;
