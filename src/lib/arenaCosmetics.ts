// PullBid Arena — cosmetic catalog (client-safe). Cosmetics are digital-only
// flair earned/bought with PullBid Credits. They never affect battle outcomes
// (purely visual) and never touch real cards. Four slots: one equipped per type.
export type CosmeticType = "frame" | "effect" | "entrance" | "title";

export type Cosmetic = {
  key: string;
  type: CosmeticType;
  name: string;
  rarity: "common" | "rare" | "epic" | "legendary";
  cost: number; // PullBid Credits
  /** Tailwind/utility classes applied to the player's fighter frame. */
  frameClass?: string;
  /** Class applied as an animated effect layer behind the fighter. */
  effectClass?: string;
  /** Short flavor for entrances. */
  entranceLabel?: string;
  /** Cosmetic title text shown next to the collector. */
  titleText?: string;
  emoji: string;
};

export const ARENA_COSMETICS: Cosmetic[] = [
  // Frames
  { key: "frame_bronze", type: "frame", name: "Bronze Frame", rarity: "common", cost: 20, frameClass: "ring-2 ring-amber-700", emoji: "🥉" },
  { key: "frame_neon", type: "frame", name: "Neon Frame", rarity: "rare", cost: 60, frameClass: "ring-2 ring-fuchsia-500 shadow-[0_0_18px_rgba(217,70,239,0.7)]", emoji: "💟" },
  { key: "frame_gold", type: "frame", name: "Champion Gold", rarity: "epic", cost: 120, frameClass: "ring-2 ring-amber-400 shadow-[0_0_22px_rgba(251,191,36,0.8)]", emoji: "🏅" },
  { key: "frame_prismatic", type: "frame", name: "Prismatic Frame", rarity: "legendary", cost: 300, frameClass: "ring-2 ring-cyan-300 shadow-[0_0_28px_rgba(34,211,238,0.9)] animate-pulse", emoji: "🌈" },
  // Effects
  { key: "fx_embers", type: "effect", name: "Embers", rarity: "rare", cost: 70, effectClass: "arena-fx-embers", emoji: "🔥" },
  { key: "fx_sparkle", type: "effect", name: "Sparkle Aura", rarity: "epic", cost: 130, effectClass: "arena-fx-sparkle", emoji: "✨" },
  { key: "fx_storm", type: "effect", name: "Storm Aura", rarity: "legendary", cost: 320, effectClass: "arena-fx-storm", emoji: "⚡" },
  // Entrances
  { key: "ent_smoke", type: "entrance", name: "Smoke Entrance", rarity: "common", cost: 25, entranceLabel: "bursts through the smoke", emoji: "💨" },
  { key: "ent_thunder", type: "entrance", name: "Thunder Entrance", rarity: "epic", cost: 140, entranceLabel: "drops in with a thunderclap", emoji: "🌩️" },
  // Titles
  { key: "title_rising", type: "title", name: "Rising Star (title)", rarity: "common", cost: 30, titleText: "Rising Star", emoji: "⭐" },
  { key: "title_unbroken", type: "title", name: "Unbroken (title)", rarity: "rare", cost: 90, titleText: "Unbroken", emoji: "🛡️" },
  { key: "title_mythic", type: "title", name: "Mythic Battler (title)", rarity: "legendary", cost: 350, titleText: "Mythic Battler", emoji: "🐲" },
];

export const COSMETIC_MAP: Record<string, Cosmetic> =
  Object.fromEntries(ARENA_COSMETICS.map((c) => [c.key, c]));

export const RARITY_COLOR: Record<Cosmetic["rarity"], string> = {
  common: "text-muted-foreground",
  rare: "text-sky-500",
  epic: "text-fuchsia-500",
  legendary: "text-amber-500",
};

export function cosmeticsByType(type: CosmeticType): Cosmetic[] {
  return ARENA_COSMETICS.filter((c) => c.type === type);
}
