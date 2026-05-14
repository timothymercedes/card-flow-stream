ALTER TABLE public.auction_queue
  ADD COLUMN IF NOT EXISTS sale_type text NOT NULL DEFAULT 'prebid',
  ADD COLUMN IF NOT EXISTS buy_now_price numeric,
  ADD COLUMN IF NOT EXISTS min_offer numeric,
  ADD COLUMN IF NOT EXISTS trigger_word text,
  ADD COLUMN IF NOT EXISTS sold_to uuid,
  ADD COLUMN IF NOT EXISTS sold_at timestamptz,
  ADD COLUMN IF NOT EXISTS order_id uuid;

ALTER TABLE public.auction_queue
  DROP CONSTRAINT IF EXISTS auction_queue_sale_type_check;
ALTER TABLE public.auction_queue
  ADD CONSTRAINT auction_queue_sale_type_check
  CHECK (sale_type IN ('prebid','buynow','offer'));

CREATE INDEX IF NOT EXISTS idx_auction_queue_trigger_word
  ON public.auction_queue(stream_id, trigger_word) WHERE trigger_word IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.queue_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_item_id uuid NOT NULL REFERENCES public.auction_queue(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL,
  buyer_username text,
  amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT queue_offers_status_check CHECK (status IN ('pending','accepted','declined','expired'))
);

CREATE INDEX IF NOT EXISTS idx_queue_offers_item ON public.queue_offers(queue_item_id);
CREATE INDEX IF NOT EXISTS idx_queue_offers_buyer ON public.queue_offers(buyer_id);

ALTER TABLE public.queue_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Buyers create their own queue offers" ON public.queue_offers
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = buyer_id);

CREATE POLICY "Buyers see their own queue offers" ON public.queue_offers
  FOR SELECT TO authenticated USING (auth.uid() = buyer_id);

CREATE POLICY "Hosts see queue offers on their items" ON public.queue_offers
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.auction_queue q WHERE q.id = queue_offers.queue_item_id AND q.host_id = auth.uid())
  );

CREATE POLICY "Hosts update queue offers on their items" ON public.queue_offers
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.auction_queue q WHERE q.id = queue_offers.queue_item_id AND q.host_id = auth.uid())
  );

CREATE POLICY "Buyers delete their pending queue offers" ON public.queue_offers
  FOR DELETE TO authenticated USING (auth.uid() = buyer_id AND status = 'pending');

ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_offers;
ALTER TABLE public.queue_offers REPLICA IDENTITY FULL;