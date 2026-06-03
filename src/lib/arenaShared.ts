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

// AI trainers — each difficulty is fronted by a named character with a rank
// and personality so Training feels like facing a real opponent, not a button.
// Used by both the Train game-mode screen and the battle stage (opponentName).
export const TRAINING_TRAINERS: Record<ArenaDifficulty, {
  name: string; rank: string; emoji: string; personality: string; style: string;
}> = {
  beginner: {
    name: "Pip", rank: "Arena Rookie", emoji: "🐣",
    personality: "Eager and friendly — the perfect first sparring partner.",
    style: "Cautious, plays it safe",
  },
  normal: {
    name: "Coach Vera", rank: "Veteran Trainer", emoji: "🧑‍🏫",
    personality: "A steady mentor who tests your fundamentals.",
    style: "Balanced, measured pressure",
  },
  hard: {
    name: "Razor Kane", rank: "Elite Challenger", emoji: "🥷",
    personality: "Ruthless and fast — punishes every mistake.",
    style: "Aggressive, high-tempo strikes",
  },
  elite: {
    name: "Champion Aurelia", rank: "Arena Champion", emoji: "👑",
    personality: "The reigning legend. Beat her to prove yourself.",
    style: "Relentless, flawless mastery",
  },
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

// ============================================================================
// Real combat engine — HP-based, with critical hits, dodge chance, status
// effects, traits, and random battle events. Shared by every AI battle type so
// outcomes are never auto-win/auto-lose: they depend on companion level, stats,
// traits, the battle type, and luck.
// ============================================================================

export type Fighter = {
  attack: number; defense: number; speed: number; level: number;
  hidden_traits?: string[];
};

export type CombatRound = { round: number; mine: number; theirs: number; winner: "mine" | "theirs" };
export type CombatResult = { log: CombatRound[]; myRounds: number; theirRounds: number; iWon: boolean };

// Random battle events add unpredictability so no battle is ever guaranteed.
const BATTLE_EVENTS = [
  { key: "none", weight: 60, mine: 1, theirs: 1 },
  { key: "surge", weight: 12, mine: 1.35, theirs: 1 },   // your companion surges
  { key: "pressure", weight: 12, mine: 1, theirs: 1.35 }, // opponent surges
  { key: "fatigue", weight: 8, mine: 0.8, theirs: 0.8 },  // both tire out
  { key: "frenzy", weight: 8, mine: 1.2, theirs: 1.2 },   // both go all-in
];

function rollEvent(): { mine: number; theirs: number } {
  const total = BATTLE_EVENTS.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * total;
  for (const e of BATTLE_EVENTS) { if ((r -= e.weight) <= 0) return { mine: e.mine, theirs: e.theirs }; }
  return { mine: 1, theirs: 1 };
}

// Flat per-round trait modifiers (kept light, applied to the attacker's roll).
function traitBonus(traits: string[] | undefined, round: number, behind: boolean): number {
  if (!traits || traits.length === 0) return 1;
  let m = 1;
  for (const t of traits) {
    switch (t) {
      case "First Strike": if (round === 1) m += 0.25; break;
      case "Berserker": case "Second Wind": if (behind) m += 0.22; break;
      case "Momentum": case "Overdrive": if (round >= 3) m += 0.15; break;
      case "Glass Cannon": m += 0.12; break;
      case "Precision": case "Tactician": m += 0.08; break;
      default: break;
    }
  }
  return m;
}

// One side's offensive roll for a round. Speed feeds crit chance; defense feeds
// dodge chance for the *defender* (handled by caller). Returns raw damage power.
function rollPower(self: Fighter, opp: Fighter, round: number, behind: boolean, eventMult: number) {
  const base = self.attack * 1.0 + self.speed * 0.5 + self.level * 4;
  const luck = 0.85 + Math.random() * 0.3;
  const trait = traitBonus(self.hidden_traits, round, behind);
  let power = base * luck * trait * eventMult;
  // Critical hit — chance scales with speed advantage.
  const critChance = Math.min(0.4, 0.08 + Math.max(0, self.speed - opp.defense) * 0.012);
  const crit = Math.random() < critChance;
  if (crit) power *= 1.85;
  // Dodge — the opponent slips the blow based on their speed.
  const dodgeChance = Math.min(0.3, 0.04 + Math.max(0, opp.speed - self.speed) * 0.01);
  const dodged = Math.random() < dodgeChance;
  if (dodged) power *= 0.18;
  return power;
}

// Resolve a full battle between two fighters. `rounds` defaults to 5 so battles
// feel substantial. The returned log is compatible with ArenaBattleStage, which
// derives crit/dodge/hit visuals from each round's margin.
export function simulateCombat(me: Fighter, them: Fighter, rounds = 5): CombatResult {
  const log: CombatRound[] = [];
  let myRounds = 0, theirRounds = 0;
  for (let r = 1; r <= rounds; r++) {
    const ev = rollEvent();
    const myPower = rollPower(me, them, r, myRounds < theirRounds, ev.mine);
    const theirPower = rollPower(them, me, r, theirRounds < myRounds, ev.theirs);
    const winner: "mine" | "theirs" = myPower >= theirPower ? "mine" : "theirs";
    if (winner === "mine") myRounds++; else theirRounds++;
    log.push({ round: r, mine: Math.round(myPower), theirs: Math.round(theirPower), winner });
  }
  return { log, myRounds, theirRounds, iWon: myRounds > theirRounds };
}

// ============================================================================
// AI opponents — bosses that are ALWAYS available so players never wait for a
// human. Each boss has a roster character, personality, fighting style, record,
// stat scaling, and full reward tier. Bosses rotate by day / week.
// ============================================================================

export type ArenaBossKey = "daily" | "weekly";

export type BossTier = {
  key: ArenaBossKey;
  label: string;
  emoji: string;
  mult: number;        // stat scaling vs the player's companion
  rounds: number;
  winXp: number; lossXp: number; winTrophies: number; winCredits: number;
};

export const AI_BOSSES: Record<ArenaBossKey, BossTier> = {
  daily: { key: "daily", label: "Daily Boss", emoji: "🔥", mult: 1.25, rounds: 5, winXp: 30, lossXp: 4, winTrophies: 5, winCredits: 3 },
  weekly: { key: "weekly", label: "Weekly Boss", emoji: "👹", mult: 1.6, rounds: 7, winXp: 80, lossXp: 8, winTrophies: 15, winCredits: 10 },
};

// Rotating boss characters. A deterministic period index (day/week number)
// selects which character fronts the boss fight.
type BossCharacter = { name: string; title: string; emoji: string; style: string; record: string; taunt: string };

const DAILY_BOSSES: BossCharacter[] = [
  { name: "Ironjaw Greel", title: "Daily Boss", emoji: "🦾", style: "Brute force, heavy hits", record: "412–88", taunt: "You won't last three rounds." },
  { name: "Lady Mirage", title: "Daily Boss", emoji: "🦊", style: "Evasive counter-fighter", record: "388–102", taunt: "Catch me if you can." },
  { name: "Sgt. Bastion", title: "Daily Boss", emoji: "🛡️", style: "Defensive wall, attrition", record: "501–60", taunt: "Break against my shield." },
  { name: "Volt Reaper", title: "Daily Boss", emoji: "⚡", style: "Lightning-fast crits", record: "455–77", taunt: "Too slow." },
  { name: "Pyra Vex", title: "Daily Boss", emoji: "🔥", style: "Burn-status aggression", record: "401–94", taunt: "Feel the heat." },
  { name: "Frost Maw", title: "Daily Boss", emoji: "❄️", style: "Freeze-control tempo", record: "377–110", taunt: "Stay frozen." },
  { name: "Hex Warden", title: "Daily Boss", emoji: "🔮", style: "Status-effect trickery", record: "420–80", taunt: "Cursed already." },
];

const WEEKLY_BOSSES: BossCharacter[] = [
  { name: "Overlord Kratheon", title: "Weekly Boss", emoji: "👹", style: "Unrelenting, flawless mastery", record: "1287–143", taunt: "None have toppled me this week." },
  { name: "The Eternal Champion", title: "Weekly Boss", emoji: "🏆", style: "Adaptive all-rounder", record: "1402–98", taunt: "Prove you belong here." },
  { name: "Nightmare Sovereign", title: "Weekly Boss", emoji: "🌑", style: "Crit + status onslaught", record: "1190–166", taunt: "Your reign ends now." },
  { name: "Titanus Prime", title: "Weekly Boss", emoji: "🤖", style: "Calculated, overwhelming power", record: "1333–120", taunt: "Resistance is illogical." },
];

export function periodIndex(key: ArenaBossKey, now = new Date()): number {
  const days = Math.floor(now.getTime() / 86_400_000);
  return key === "daily" ? days : Math.floor(days / 7);
}

export function bossCharacter(key: ArenaBossKey, now = new Date()): BossCharacter {
  const list = key === "daily" ? DAILY_BOSSES : WEEKLY_BOSSES;
  return list[periodIndex(key, now) % list.length];
}
