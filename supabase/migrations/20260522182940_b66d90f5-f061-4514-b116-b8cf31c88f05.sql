
CREATE TABLE IF NOT EXISTS public.policy_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  policy_version text NOT NULL,
  policy_type text NOT NULL CHECK (policy_type IN ('final_sale','buyer_protection')),
  acceptance_context text NOT NULL CHECK (acceptance_context IN ('checkout','bid','instant_win','offer_accept','payment','marketplace_buy')),
  order_id uuid NULL REFERENCES public.orders(id) ON DELETE SET NULL,
  stream_id uuid NULL,
  listing_id uuid NULL,
  ip_address text NULL,
  user_agent text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  accepted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_policy_acceptances_user ON public.policy_acceptances(user_id, accepted_at DESC);
CREATE INDEX IF NOT EXISTS idx_policy_acceptances_order ON public.policy_acceptances(order_id) WHERE order_id IS NOT NULL;

ALTER TABLE public.policy_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own acceptances"
ON public.policy_acceptances FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Users insert own acceptances"
ON public.policy_acceptances FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));
