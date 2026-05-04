-- Anti-snipe: track total seconds added by snipe protection per round (for UI)
ALTER TABLE public.live_streams
  ADD COLUMN IF NOT EXISTS snipe_extends integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS snipe_price numeric,
  ADD COLUMN IF NOT EXISTS break_mode text,
  ADD COLUMN IF NOT EXISTS break_teams jsonb;

-- Chat moderation: mute/timeout/ban per stream
CREATE TABLE IF NOT EXISTS public.stream_chat_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  target_username text NOT NULL,
  action text NOT NULL CHECK (action IN ('mute','timeout','ban','unmute','unban')),
  by_user_id uuid NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stream_chat_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Actions viewable by all" ON public.stream_chat_actions FOR SELECT USING (true);
CREATE POLICY "Staff create chat actions" ON public.stream_chat_actions
  FOR INSERT WITH CHECK (auth.uid() = by_user_id AND public.is_stream_staff(stream_id, auth.uid()));
CREATE INDEX IF NOT EXISTS idx_chat_actions_lookup ON public.stream_chat_actions(stream_id, target_user_id, created_at DESC);

-- Mystery break random pulls (sports/team breaks)
CREATE TABLE IF NOT EXISTS public.break_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id uuid NOT NULL,
  buyer_id uuid NOT NULL,
  buyer_username text NOT NULL,
  team_label text,
  amount numeric NOT NULL,
  assigned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.break_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Break slots viewable by all" ON public.break_slots FOR SELECT USING (true);
CREATE POLICY "Buyers claim break slot" ON public.break_slots
  FOR INSERT WITH CHECK (auth.uid() = buyer_id);
CREATE POLICY "Host updates break slots" ON public.break_slots
  FOR UPDATE USING (EXISTS (SELECT 1 FROM public.live_streams ls WHERE ls.id = break_slots.stream_id AND ls.seller_id = auth.uid()));

-- Buyer multi-currency display preference
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_currency text DEFAULT 'USD';

-- Push subscriptions for "going live" notifications (web push)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own subs" ON public.push_subscriptions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
