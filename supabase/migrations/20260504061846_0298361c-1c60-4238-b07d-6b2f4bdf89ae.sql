-- 1) Unique usernames (case-insensitive). Resolve any pre-existing duplicates.
WITH d AS (
  SELECT id, username,
    row_number() OVER (PARTITION BY lower(username) ORDER BY created_at) AS rn
  FROM public.profiles
)
UPDATE public.profiles p
SET username = p.username || '_' || (d.rn - 1)::text
FROM d
WHERE p.id = d.id AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_unique
  ON public.profiles (lower(username));

-- 2) Card condition + TCG metadata
DO $$ BEGIN
  CREATE TYPE public.card_condition AS ENUM ('NM','LP','MP','Damaged');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.vault_cards
  ADD COLUMN IF NOT EXISTS condition public.card_condition,
  ADD COLUMN IF NOT EXISTS tcg_number text,
  ADD COLUMN IF NOT EXISTS tcg_set text;

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS condition public.card_condition,
  ADD COLUMN IF NOT EXISTS tcg_number text,
  ADD COLUMN IF NOT EXISTS tcg_set text;

ALTER TABLE public.live_streams
  ADD COLUMN IF NOT EXISTS current_condition public.card_condition,
  ADD COLUMN IF NOT EXISTS current_tcg_number text,
  ADD COLUMN IF NOT EXISTS current_tcg_set text,
  ADD COLUMN IF NOT EXISTS quick_start_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_timer_sec integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS default_starting_bid numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS default_condition public.card_condition;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS condition public.card_condition;

-- 3) WebAuthn passkey credentials
CREATE TABLE IF NOT EXISTS public.webauthn_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  credential_id text NOT NULL UNIQUE,
  public_key text NOT NULL,
  counter bigint NOT NULL DEFAULT 0,
  transports text,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

ALTER TABLE public.webauthn_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own credentials"
  ON public.webauthn_credentials FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own credentials"
  ON public.webauthn_credentials FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own credentials"
  ON public.webauthn_credentials FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users update own credentials"
  ON public.webauthn_credentials FOR UPDATE
  USING (auth.uid() = user_id);