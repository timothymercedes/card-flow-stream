// PullBid Live — Collector ranks (Priority 5).
// Named ranks derived from progression level, mirroring the master roadmap.
export type CollectorRank = {
  name: string;
  minLevel: number;
  emoji: string;
  /** Tailwind gradient classes for the rank badge. */
  gradient: string;
};

// Ordered low → high. A user's rank is the highest tier whose minLevel <= level.
export const COLLECTOR_RANKS: CollectorRank[] = [
  { name: "Rookie Collector", minLevel: 1, emoji: "🌱", gradient: "from-sky-500 to-cyan-500" },
  { name: "Collector", minLevel: 5, emoji: "📦", gradient: "from-emerald-500 to-teal-500" },
  { name: "Advanced Collector", minLevel: 10, emoji: "⭐", gradient: "from-amber-500 to-orange-500" },
  { name: "Elite Collector", minLevel: 20, emoji: "💎", gradient: "from-fuchsia-500 to-pink-500" },
  { name: "Vault Legend", minLevel: 35, emoji: "🏆", gradient: "from-violet-500 to-indigo-500" },
  { name: "Master Collector", minLevel: 50, emoji: "👑", gradient: "from-amber-400 via-fuchsia-500 to-violet-600" },
];

export function collectorRank(level: number): CollectorRank {
  let rank = COLLECTOR_RANKS[0];
  for (const r of COLLECTOR_RANKS) {
    if (level >= r.minLevel) rank = r;
  }
  return rank;
}

/** The next rank a collector is working toward, or null if maxed out. */
export function nextCollectorRank(level: number): CollectorRank | null {
  return COLLECTOR_RANKS.find((r) => r.minLevel > level) ?? null;
}
