
ALTER TABLE public.vault_cards
  ADD COLUMN IF NOT EXISTS estimated_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS price numeric;

-- allow vault owner to update their cards
DROP POLICY IF EXISTS "Users update own vault" ON public.vault_cards;
CREATE POLICY "Users update own vault" ON public.vault_cards
  FOR UPDATE USING (auth.uid() = user_id);

ALTER TABLE public.live_streams
  ADD COLUMN IF NOT EXISTS shipping_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_method text,
  ADD COLUMN IF NOT EXISTS winner_username text;
