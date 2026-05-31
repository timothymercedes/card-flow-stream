CREATE TABLE public.vault_value_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  total_value NUMERIC NOT NULL DEFAULT 0,
  total_cost NUMERIC NOT NULL DEFAULT 0,
  card_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, snapshot_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vault_value_snapshots TO authenticated;
GRANT ALL ON public.vault_value_snapshots TO service_role;

ALTER TABLE public.vault_value_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view their vault snapshots"
ON public.vault_value_snapshots FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Owners can create their vault snapshots"
ON public.vault_value_snapshots FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners can update their vault snapshots"
ON public.vault_value_snapshots FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX idx_vault_snapshots_user_date ON public.vault_value_snapshots (user_id, snapshot_date);