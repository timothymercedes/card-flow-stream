// PullBid Arena — Training game mode metadata (client-side / presentational).
// Environments theme the practice battle; missions give players goals to chase.
import type { ArenaDifficulty } from "@/lib/arenaShared";

export type TrainingEnvironment = { key: string; label: string; emoji: string };

// Per arena_category practice environments. "all" is the fallback for
// companions without a specific category.
export const TRAINING_ENVIRONMENTS: Record<string, TrainingEnvironment[]> = {
  pokemon: [
    { key: "forest", label: "Forest", emoji: "🌲" },
    { key: "cave", label: "Cave", emoji: "🪨" },
    { key: "mountain", label: "Mountain", emoji: "⛰️" },
  ],
  onepiece: [
    { key: "ship_deck", label: "Ship Deck", emoji: "⛵" },
    { key: "harbor", label: "Harbor", emoji: "⚓" },
    { key: "island", label: "Island", emoji: "🏝️" },
  ],
  mtg: [
    { key: "arcane_temple", label: "Arcane Temple", emoji: "🔮" },
    { key: "mystic_forest", label: "Mystic Forest", emoji: "🌌" },
  ],
  yugioh: [
    { key: "duel_grounds", label: "Duel Grounds", emoji: "🃏" },
    { key: "ancient_ruins", label: "Ancient Ruins", emoji: "🏛️" },
  ],
  sports: [
    { key: "stadium", label: "Stadium", emoji: "🏟️" },
    { key: "training_facility", label: "Training Facility", emoji: "🏋️" },
  ],
  all: [
    { key: "arena", label: "Training Arena", emoji: "⚔️" },
    { key: "dojo", label: "Dojo", emoji: "🥋" },
  ],
};

export function environmentsFor(category: string | null | undefined): TrainingEnvironment[] {
  return TRAINING_ENVIRONMENTS[category ?? "all"] ?? TRAINING_ENVIRONMENTS.all;
}

export function environmentMeta(category: string | null | undefined, key: string | null | undefined): TrainingEnvironment {
  const list = environmentsFor(category);
  return list.find((e) => e.key === key) ?? list[0];
}

// ---- Training missions (progress derived from PVE battle history) ----
export type MissionPayout =
  | { kind: "credits"; amount: number }
  | { kind: "cosmetic"; cosmeticKey: string };

export type TrainingMission = {
  key: string;
  label: string;
  goal: number;
  reward: string;
  payout: MissionPayout;
  count: (battles: BattleRecord[]) => number;
};

type BattleRecord = {
  type: "pvp" | "pve" | "boss";
  difficulty: ArenaDifficulty | null;
  iWon: boolean;
};

export const TRAINING_MISSIONS: TrainingMission[] = [
  {
    key: "win_3",
    label: "Win 3 Training Battles",
    goal: 3,
    reward: "+10 🪙 Credits",
    payout: { kind: "credits", amount: 10 },
    count: (b) => b.filter((x) => x.type === "pve" && x.iWon).length,
  },
  {
    key: "defeat_elite",
    label: "Defeat Elite AI",
    goal: 1,
    reward: "🛡️ Unbroken title",
    payout: { kind: "cosmetic", cosmeticKey: "title_unbroken" },
    count: (b) => b.filter((x) => x.type === "pve" && x.iWon && x.difficulty === "elite").length,
  },
  {
    key: "train_5",
    label: "Train Your Companion 5 Times",
    goal: 5,
    reward: "+15 🪙 Credits",
    payout: { kind: "credits", amount: 15 },
    count: (b) => b.filter((x) => x.type === "pve").length,
  },
  {
    key: "all_trainers",
    label: "Face All 4 AI Trainers",
    goal: 4,
    reward: "💨 Smoke Entrance cosmetic",
    payout: { kind: "cosmetic", cosmeticKey: "ent_smoke" },
    count: (b) => {
      const seen = new Set<string>();
      for (const x of b) if (x.type === "pve" && x.difficulty) seen.add(x.difficulty);
      return seen.size;
    },
  },
];

// Server-safe lookup so the claim endpoint can validate progress + payout.
export const MISSION_MAP: Record<string, TrainingMission> = Object.fromEntries(
  TRAINING_MISSIONS.map((m) => [m.key, m]),
);
