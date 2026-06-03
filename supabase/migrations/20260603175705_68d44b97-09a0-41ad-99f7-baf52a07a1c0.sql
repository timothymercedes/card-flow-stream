-- Arena Category System: give each companion a canonical arena_category for
-- category-scoped matchmaking and leaderboards (pokemon, onepiece, mtg, yugioh,
-- sports, lorcana, marvel, starwars, wrestling, other).
ALTER TABLE public.arena_companions
  ADD COLUMN IF NOT EXISTS arena_category text NOT NULL DEFAULT 'other';

-- Backfill from the free-form category text, mirroring normalizeTcgCategory().
UPDATE public.arena_companions ac
SET arena_category = CASE
  WHEN comp LIKE '%pokemon%' THEN 'pokemon'
  WHEN comp LIKE '%yugioh%' THEN 'yugioh'
  WHEN comp LIKE '%onepiece%' OR comp = 'optcg' THEN 'onepiece'
  WHEN comp LIKE 'mtg%' OR comp LIKE '%magic%' THEN 'mtg'
  WHEN comp LIKE '%lorcana%' THEN 'lorcana'
  WHEN comp LIKE '%marvel%' THEN 'marvel'
  WHEN comp LIKE '%starwars%' THEN 'starwars'
  WHEN comp LIKE '%wrestling%' OR comp LIKE '%wwe%' OR comp LIKE '%aew%' THEN 'wrestling'
  WHEN comp LIKE 'sport%' THEN 'sports'
  ELSE 'other'
END
FROM (
  SELECT id, regexp_replace(
    translate(lower(coalesce(category, '')),
      'éèêëáàâäíìîïóòôöúùûüñç', 'eeeeaaaaiiiioooouuuunc'),
    '[^a-z0-9]', '', 'g') AS comp
  FROM public.arena_companions
) src
WHERE src.id = ac.id;

CREATE INDEX IF NOT EXISTS idx_arena_companions_category
  ON public.arena_companions (arena_category);
CREATE INDEX IF NOT EXISTS idx_arena_companions_category_wins
  ON public.arena_companions (arena_category, wins DESC);
