-- Per-grade / sealed values, pricing confidence, AI flags, and enrichment status on vault cards
ALTER TABLE public.vault_cards
  ADD COLUMN IF NOT EXISTS grade_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_sealed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS price_confidence text,
  ADD COLUMN IF NOT EXISTS price_is_ai boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rarity text,
  ADD COLUMN IF NOT EXISTS variant text,
  ADD COLUMN IF NOT EXISTS enrichment_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS ai_suggestion jsonb,
  ADD COLUMN IF NOT EXISTS ai_suggested_at timestamptz;

-- "Report incorrect price" submissions
CREATE TABLE IF NOT EXISTS public.price_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vault_card_id uuid NOT NULL REFERENCES public.vault_cards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  card_name text NOT NULL,
  category text,
  shown_value numeric,
  suggested_value numeric,
  price_source text,
  reason text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_reports TO authenticated;
GRANT ALL ON public.price_reports TO service_role;

ALTER TABLE public.price_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own price reports"
  ON public.price_reports FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own price reports"
  ON public.price_reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_price_reports_user ON public.price_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_price_reports_card ON public.price_reports(vault_card_id);