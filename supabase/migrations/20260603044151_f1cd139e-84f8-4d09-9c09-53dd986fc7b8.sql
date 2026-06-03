CREATE TABLE public.collection_goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  set_name TEXT NOT NULL,
  category TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, category, set_name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.collection_goals TO authenticated;
GRANT ALL ON public.collection_goals TO service_role;

ALTER TABLE public.collection_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Goals are viewable by everyone"
ON public.collection_goals FOR SELECT USING (true);

CREATE POLICY "Users can add their own goals"
ON public.collection_goals FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own goals"
ON public.collection_goals FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own goals"
ON public.collection_goals FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE TRIGGER set_collection_goals_updated_at
BEFORE UPDATE ON public.collection_goals
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_collection_goals_user ON public.collection_goals(user_id);