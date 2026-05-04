-- Seller reviews from buyers after delivered orders
CREATE TABLE public.seller_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  buyer_id uuid NOT NULL,
  buyer_username text NOT NULL,
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  shipping_rating int NOT NULL CHECK (shipping_rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, buyer_id)
);

ALTER TABLE public.seller_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviews viewable by all"
  ON public.seller_reviews FOR SELECT USING (true);

CREATE POLICY "Buyers create reviews for own delivered orders"
  ON public.seller_reviews FOR INSERT
  WITH CHECK (
    auth.uid() = buyer_id
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id AND o.buyer_id = auth.uid() AND o.seller_id = seller_reviews.seller_id
    )
  );

CREATE POLICY "Buyers update own reviews"
  ON public.seller_reviews FOR UPDATE
  USING (auth.uid() = buyer_id);

CREATE INDEX idx_seller_reviews_seller ON public.seller_reviews(seller_id);
CREATE INDEX idx_seller_reviews_order ON public.seller_reviews(order_id);

-- Optional preferred language per vault card so we can re-pull localized art later
ALTER TABLE public.vault_cards ADD COLUMN IF NOT EXISTS language text DEFAULT 'en';