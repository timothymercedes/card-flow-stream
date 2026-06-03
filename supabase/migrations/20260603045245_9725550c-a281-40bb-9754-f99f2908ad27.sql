-- Collection Streaks: reward daily collecting activity
CREATE TABLE public.collection_streaks (
  user_id UUID NOT NULL PRIMARY KEY,
  current_streak INT NOT NULL DEFAULT 0,
  longest_streak INT NOT NULL DEFAULT 0,
  last_activity_date DATE,
  total_activities INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.collection_streaks TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.collection_streaks TO authenticated;
GRANT ALL ON public.collection_streaks TO service_role;

ALTER TABLE public.collection_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Streaks are viewable by everyone"
ON public.collection_streaks FOR SELECT USING (true);

CREATE POLICY "Users manage their own streak"
ON public.collection_streaks FOR ALL
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_collection_streaks_updated_at
BEFORE UPDATE ON public.collection_streaks
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Record one activity per UTC day, advancing or resetting the streak.
CREATE OR REPLACE FUNCTION public.record_collection_activity(_user_id UUID)
RETURNS TABLE(current_streak INT, longest_streak INT, gained BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _row public.collection_streaks;
  _today DATE := (now() AT TIME ZONE 'utc')::date;
  _new INT;
  _gained BOOLEAN := false;
BEGIN
  SELECT * INTO _row FROM public.collection_streaks WHERE user_id = _user_id;
  IF NOT FOUND THEN
    INSERT INTO public.collection_streaks(user_id, current_streak, longest_streak, last_activity_date, total_activities)
    VALUES (_user_id, 1, 1, _today, 1)
    RETURNING * INTO _row;
    _gained := true;
  ELSIF _row.last_activity_date IS DISTINCT FROM _today THEN
    IF _row.last_activity_date = _today - 1 THEN
      _new := _row.current_streak + 1;
    ELSE
      _new := 1;
    END IF;
    UPDATE public.collection_streaks
      SET current_streak = _new,
          longest_streak = GREATEST(longest_streak, _new),
          last_activity_date = _today,
          total_activities = total_activities + 1
      WHERE user_id = _user_id
      RETURNING * INTO _row;
    _gained := true;
  END IF;
  RETURN QUERY SELECT _row.current_streak, _row.longest_streak, _gained;
END;
$$;

-- Community Collection Challenges: communities work together on a set goal
CREATE TABLE public.community_challenges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  set_name TEXT,
  category TEXT,
  target_count INT NOT NULL DEFAULT 100,
  ends_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.community_challenges TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_challenges TO authenticated;
GRANT ALL ON public.community_challenges TO service_role;

ALTER TABLE public.community_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Challenges are viewable by everyone"
ON public.community_challenges FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create challenges"
ON public.community_challenges FOR INSERT TO authenticated
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Creators can update their challenges"
ON public.community_challenges FOR UPDATE TO authenticated
USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Creators can delete their challenges"
ON public.community_challenges FOR DELETE TO authenticated
USING (auth.uid() = created_by);

CREATE INDEX idx_community_challenges_community ON public.community_challenges(community_id);

CREATE TRIGGER trg_community_challenges_updated_at
BEFORE UPDATE ON public.community_challenges
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.community_challenge_contributions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  challenge_id UUID NOT NULL REFERENCES public.community_challenges(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  contribution INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (challenge_id, user_id)
);

GRANT SELECT ON public.community_challenge_contributions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_challenge_contributions TO authenticated;
GRANT ALL ON public.community_challenge_contributions TO service_role;

ALTER TABLE public.community_challenge_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contributions are viewable by everyone"
ON public.community_challenge_contributions FOR SELECT USING (true);

CREATE POLICY "Users manage their own contributions"
ON public.community_challenge_contributions FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_challenge_contributions_challenge ON public.community_challenge_contributions(challenge_id);

CREATE TRIGGER trg_challenge_contributions_updated_at
BEFORE UPDATE ON public.community_challenge_contributions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();