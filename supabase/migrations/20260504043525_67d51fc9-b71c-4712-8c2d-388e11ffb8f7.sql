
ALTER TABLE public.live_streams
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'live',
  ADD COLUMN IF NOT EXISTS ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS winner_id uuid,
  ADD COLUMN IF NOT EXISTS winning_bid numeric,
  ADD COLUMN IF NOT EXISTS item_image_url text,
  ADD COLUMN IF NOT EXISTS min_bid_increment numeric NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS public.receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id uuid,
  listing_id uuid,
  buyer_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  item_name text NOT NULL,
  item_image_url text,
  amount numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Receipt parties view"
ON public.receipts FOR SELECT
USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

CREATE POLICY "Sellers create receipts"
ON public.receipts FOR INSERT
WITH CHECK (auth.uid() = seller_id);
