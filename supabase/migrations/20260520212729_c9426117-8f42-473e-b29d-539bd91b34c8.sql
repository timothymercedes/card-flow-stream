
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE IF NOT EXISTS public.buyer_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id text NOT NULL,
  stripe_payment_method_id text NOT NULL UNIQUE,
  brand text,
  last4 text,
  exp_month int,
  exp_year int,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_buyer_payment_methods_user
  ON public.buyer_payment_methods(user_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_buyer_payment_methods_one_default
  ON public.buyer_payment_methods(user_id) WHERE is_default = true;

ALTER TABLE public.buyer_payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "buyer_pm_select_own" ON public.buyer_payment_methods
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "buyer_pm_insert_own" ON public.buyer_payment_methods
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "buyer_pm_update_own" ON public.buyer_payment_methods
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "buyer_pm_delete_own" ON public.buyer_payment_methods
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_buyer_pm_updated_at
  BEFORE UPDATE ON public.buyer_payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
