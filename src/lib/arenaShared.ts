// PullBid Arena — shared, client-safe helpers (no secrets, no server imports).
// Pure functions used by both UI and server functions.

export type ArenaTitle = "rookie" | "veteran" | "elite" | "champion" | "legend";
export type ArenaCommunity = "pokemon" | "sports" | "onepiece" | "general";

export const COMMUNITY_META: Record<ArenaCommunity, { label: string; arena: string; emoji: string }> = {
  pokemon: { label: "Pokémon", arena: "Pokémon Arena", emoji: "⚡" },
  sports: { label: "Sports", arena: "Sports Arena", emoji: "🏆" },
  onepiece: { label: "One Piece", arena: "Pirate Arena", emoji: "🏴‍☠️" },
  general: { label: "All", arena: "PullBid Arena", emoji: "⚔️" },
};

export const TITLE_META: Record<ArenaTitle, { label: string; minWins: number; color: string }> = {
  rookie: { label: "Rookie Fighter", minWins: 0, color: "text-muted-foreground" },
  veteran: { label: "Veteran Fighter", minWins: 10, color: "text-sky-500" },
  elite: { label: "Elite Fighter", minWins: 50, color: "text-violet-500" },
  champion: { label: "Champion Fighter", minWins: 150, color: "text-amber-500" },
  legend: { label: "Legend Fighter", minWins: 500, color: "text-fuchsia-500" },
};

export function titleForWins(wins: number): ArenaTitle {
  if (wins >= 500) return "legend";
  if (wins >= 150) return "champion";
  if (wins >= 50) return "elite";
  if (wins >= 10) return "veteran";
  return "rookie";
}

export function communityForCategory(category: string | null | undefined): ArenaCommunity {
  const c = String(category || "").toLowerCase();
  if (/pok[eé]mon/.test(c)) return "pokemon";
  if (/one ?piece/.test(c)) return "onepiece";
  if (/sport|topps|panini|upper deck|bowman|donruss|fleer|score|basketball|football|baseball|soccer/.test(c)) return "sports";
  return "general";
}

// Companion level from accumulated XP (mirrors progression: level = sqrt(xp/100)+1)
export function companionLevel(xp: number): number {
  return Math.max(1, Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1);
}
export function xpForLevel(level: number): number {
  return (level - 1) * (level - 1) * 100;
}
export function companionLevelProgress(xp: number): { level: number; pct: number; current: number; needed: number } {
  const level = companionLevel(xp);
  const cur = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const pct = Math.min(100, Math.round(((xp - cur) / (next - cur)) * 100));
  return { level, pct, current: xp - cur, needed: next - cur };
}

// Deterministic 32-bit hash → stable per companion seed.
export function seedFrom(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const TRAIT_POOL = [
  "First Strike", "Iron Wall", "Berserker", "Lucky Draw", "Counter Stance",
  "Adrenaline", "Glass Cannon", "Tactician", "Second Wind", "Intimidate",
  "Precision", "Guardian", "Momentum", "Overdrive", "Steadfast",
];

// Derive base combat stats + hidden traits deterministically from the card.
export function deriveCompanionStats(seedKey: string, valueTier: number): {
  attack: number; defense: number; speed: number; hidden_traits: string[];
} {
  const s = seedFrom(seedKey);
  const tierBonus = Math.min(20, valueTier); // higher value cards = stronger base
  const attack = 8 + (s % 18) + tierBonus;
  const defense = 8 + ((s >> 8) % 18) + tierBonus;
  const speed = 8 + ((s >> 16) % 18) + tierBonus;
  const t1 = TRAIT_POOL[s % TRAIT_POOL.length];
  const t2 = TRAIT_POOL[(s >> 12) % TRAIT_POOL.length];
  const hidden_traits = Array.from(new Set([t1, t2]));
  return { attack, defense, speed, hidden_traits };
}

// ---- PVE (computer battles) ----
// Difficulty presets. `mult` scales the computer opponent's effective power
// relative to the player's companion. Rewards are intentionally capped far
// below PVP so training can never replace real battles (anti-abuse).
export type ArenaDifficulty = "beginner" | "normal" | "hard" | "elite";

export const DIFFICULTY_META: Record<ArenaDifficulty, {
  label: string; emoji: string; mult: number;
  // capped rewards on a PVE win / consolation on a PVE loss
  winXp: number; lossXp: number; winTrophies: number;
}> = {
  beginner: { label: "Beginner", emoji: "🟢", mult: 0.7, winXp: 5, lossXp: 1, winTrophies: 1 },
  normal:   { label: "Normal",   emoji: "🔵", mult: 0.95, winXp: 5, lossXp: 1, winTrophies: 1 },
  hard:     { label: "Hard",     emoji: "🟠", mult: 1.15, winXp: 8, lossXp: 2, winTrophies: 2 },
  elite:    { label: "Elite",    emoji: "🔴", mult: 1.4, winXp: 10, lossXp: 2, winTrophies: 3 },
};

// Reference PVP rewards (kept here so UI can show the contrast). Real battles
// are always more valuable than computer training.
export const PVP_WIN_XP = 50;

// Credits awarded to the winner of a real PVP battle. PVE never pays credits.
export const PVP_WIN_CREDITS = 5;

// ---- Arena badges ----
export type ArenaBadgeKey =
  | "first_win" | "streak_5" | "streak_10" | "wins_25" | "wins_100"
  | "champion" | "legend" | "social_battler";

export const ARENA_BADGES: Record<ArenaBadgeKey, { label: string; emoji: string; desc: string }> = {
  first_win:      { label: "First Blood",      emoji: "🩸", desc: "Win your first Arena battle" },
  streak_5:       { label: "On Fire",          emoji: "🔥", desc: "Reach a 5-win streak" },
  streak_10:      { label: "Unstoppable",      emoji: "⚡", desc: "Reach a 10-win streak" },
  wins_25:        { label: "Gladiator",        emoji: "🛡️", desc: "Win 25 Arena battles" },
  wins_100:       { label: "Centurion",        emoji: "🏆", desc: "Win 100 Arena battles" },
  champion:       { label: "Champion",         emoji: "👑", desc: "Earn the Champion title (150 wins)" },
  legend:         { label: "Living Legend",    emoji: "🌟", desc: "Earn the Legend title (500 wins)" },
  social_battler: { label: "Social Battler",   emoji: "🤝", desc: "Challenge a collector you follow" },
};

// Compute which milestone badges a user qualifies for from aggregate stats.
export function earnedBadgeKeys(totalWins: number, longestStreak: number): ArenaBadgeKey[] {
  const keys: ArenaBadgeKey[] = [];
  if (totalWins >= 1) keys.push("first_win");
  if (longestStreak >= 5) keys.push("streak_5");
  if (longestStreak >= 10) keys.push("streak_10");
  if (totalWins >= 25) keys.push("wins_25");
  if (totalWins >= 100) keys.push("wins_100");
  if (totalWins >= 150) keys.push("champion");
  if (totalWins >= 500) keys.push("legend");
  return keys;
}

// Map a card's estimated value into a 0..20 tier for stat scaling.
export function valueTier(value: number | null | undefined): number {
  const v = Number(value) || 0;
  if (v <= 0) return 0;
  return Math.min(20, Math.round(Math.log10(v + 1) * 6));
}
