-- ========== Trade System ==========

ALTER TABLE public.vault_cards
  ADD COLUMN IF NOT EXISTS accept_trades boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trade_plus_cash boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accept_offers boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS collection_only boolean NOT NULL DEFAULT false;

CREATE TABLE public.trades (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  from_user uuid NOT NULL,
  to_user uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  cash_amount numeric NOT NULL DEFAULT 0,
  cash_direction text NOT NULL DEFAULT 'none',
  message text,
  parent_trade_id uuid REFERENCES public.trades(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  CONSTRAINT trades_status_check CHECK (status = ANY (ARRAY['pending','countered','accepted','shipped','delivered','completed','cancelled'])),
  CONSTRAINT trades_cash_dir_check CHECK (cash_direction = ANY (ARRAY['none','from_pays','to_pays'])),
  CONSTRAINT trades_distinct_users CHECK (from_user <> to_user),
  CONSTRAINT trades_cash_nonneg CHECK (cash_amount >= 0)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trades TO authenticated;
GRANT ALL ON public.trades TO service_role;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trade participants view" ON public.trades
  FOR SELECT TO authenticated
  USING (auth.uid() = from_user OR auth.uid() = to_user);
CREATE POLICY "Users create trades" ON public.trades
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = from_user);
CREATE POLICY "Trade participants update" ON public.trades
  FOR UPDATE TO authenticated
  USING (auth.uid() = from_user OR auth.uid() = to_user);

CREATE INDEX idx_trades_from ON public.trades(from_user, created_at DESC);
CREATE INDEX idx_trades_to ON public.trades(to_user, created_at DESC);

CREATE TABLE public.trade_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trade_id uuid NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  owner_side text NOT NULL,
  owner_id uuid NOT NULL,
  vault_card_id uuid,
  card_name text NOT NULL,
  card_image_url text,
  card_value numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT trade_items_side_check CHECK (owner_side = ANY (ARRAY['from','to']))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_items TO authenticated;
GRANT ALL ON public.trade_items TO service_role;
ALTER TABLE public.trade_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trade item participants view" ON public.trade_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.trades t WHERE t.id = trade_id AND (t.from_user = auth.uid() OR t.to_user = auth.uid())));
CREATE POLICY "Trade item participants insert" ON public.trade_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.trades t WHERE t.id = trade_id AND (t.from_user = auth.uid() OR t.to_user = auth.uid())));

CREATE INDEX idx_trade_items_trade ON public.trade_items(trade_id);

CREATE TABLE public.trade_ratings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trade_id uuid NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  rater_id uuid NOT NULL,
  ratee_id uuid NOT NULL,
  stars integer NOT NULL,
  comment text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT trade_ratings_stars_check CHECK (stars BETWEEN 1 AND 5),
  CONSTRAINT trade_ratings_unique UNIQUE (trade_id, rater_id)
);

GRANT SELECT, INSERT ON public.trade_ratings TO authenticated;
GRANT SELECT ON public.trade_ratings TO anon;
GRANT ALL ON public.trade_ratings TO service_role;
ALTER TABLE public.trade_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trade ratings public read" ON public.trade_ratings
  FOR SELECT USING (true);
CREATE POLICY "Raters create rating" ON public.trade_ratings
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = rater_id);

CREATE INDEX idx_trade_ratings_ratee ON public.trade_ratings(ratee_id);

CREATE TRIGGER trg_trades_updated_at
  BEFORE UPDATE ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.grant_user_xp(_user_id uuid, _amount integer, _reason text, _ref_id text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  next_xp bigint;
BEGIN
  IF _user_id IS NULL OR _amount IS NULL OR _amount = 0 THEN RETURN; END IF;
  INSERT INTO public.user_progression (user_id, xp, lifetime_xp, level)
  VALUES (_user_id, GREATEST(0, _amount), GREATEST(0, _amount), 1)
  ON CONFLICT (user_id) DO UPDATE
    SET xp = GREATEST(0, public.user_progression.xp + _amount),
        lifetime_xp = public.user_progression.lifetime_xp + GREATEST(0, _amount),
        updated_at = now()
  RETURNING xp INTO next_xp;
  UPDATE public.user_progression SET level = public.xp_to_level(next_xp) WHERE user_id = _user_id;
  INSERT INTO public.xp_events (user_id, amount, reason, ref_id) VALUES (_user_id, _amount, _reason, _ref_id);
END;
$function$;

INSERT INTO public.achievements (slug, title, description, icon, category, xp_reward, threshold, sort_order)
VALUES
  ('first_trade', 'First Trade', 'Complete your first trade', 'repeat', 'trading', 100, 1, 50),
  ('trade_master', 'Trade Master', 'Complete 25 trades', 'repeat', 'trading', 500, 25, 51)
ON CONFLICT (slug) DO NOTHING;

ALTER PUBLICATION supabase_realtime ADD TABLE public.trades;