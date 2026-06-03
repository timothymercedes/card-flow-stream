ALTER TABLE public.arena_battles
  ADD COLUMN IF NOT EXISTS battle_type text NOT NULL DEFAULT 'pvp',
  ADD COLUMN IF NOT EXISTS difficulty text;

ALTER TABLE public.arena_battles ALTER COLUMN opponent_id DROP NOT NULL;
ALTER TABLE public.arena_battles ALTER COLUMN opponent_companion_id DROP NOT NULL;