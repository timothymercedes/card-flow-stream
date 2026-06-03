CREATE TABLE public.arena_mission_claims (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  mission_key TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, mission_key)
);

GRANT SELECT, INSERT ON public.arena_mission_claims TO authenticated;
GRANT ALL ON public.arena_mission_claims TO service_role;

ALTER TABLE public.arena_mission_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own mission claims"
ON public.arena_mission_claims FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own mission claims"
ON public.arena_mission_claims FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);