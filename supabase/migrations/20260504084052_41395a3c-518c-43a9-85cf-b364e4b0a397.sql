-- Allow buyers to update their own order (needed for safe-mode Pay Now)
CREATE POLICY "Buyers update own orders"
  ON public.orders FOR UPDATE
  USING (auth.uid() = buyer_id);

-- Stripe Connect data structure on profiles (ready for future activation)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_account_id text,
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_charges_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_onboarding_status text NOT NULL DEFAULT 'not_started';

-- Track which seller account collected a given order (for future payout reconciliation)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS seller_stripe_account_id text,
  ADD COLUMN IF NOT EXISTS commission_amount numeric,
  ADD COLUMN IF NOT EXISTS seller_payout_amount numeric;