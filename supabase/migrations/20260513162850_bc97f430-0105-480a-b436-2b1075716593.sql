-- Add tables to realtime publication for live UI sync across marketplace, listings, and reviews
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.listings;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.seller_reviews;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.follows;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

ALTER TABLE public.listings REPLICA IDENTITY FULL;
ALTER TABLE public.seller_reviews REPLICA IDENTITY FULL;
ALTER TABLE public.follows REPLICA IDENTITY FULL;