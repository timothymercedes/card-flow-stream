// PullBid Arena — Category System (client-safe, no secrets/server imports).
// One Arena engine, many collecting communities. Collectors battle and rank
// within their own category. Categories mirror the canonical TCG taxonomy in
// tcgCategory.ts so Collection Books, Trades, Rewards and Arena stay aligned.
import { normalizeTcgCategory } from "@/lib/tcgCategory";

export type ArenaCategory =
  | "pokemon" | "onepiece" | "mtg" | "yugioh" | "sports"
  | "lorcana" | "marvel" | "starwars" | "wrestling" | "other";

export type ArenaCategoryMeta = {
  key: ArenaCategory;
  label: string;
  emoji: string;
  /** Category-specific honorary titles, ascending in prestige. Expandable. */
  titles: string[];
};

// Ordered for display. "other" is a catch-all bucket for unmapped collectibles.
export const ARENA_CATEGORIES: ArenaCategoryMeta[] = [
  { key: "pokemon", label: "Pokémon Arena", emoji: "⚡",
    titles: ["Kanto Champion", "Arena Master", "Pokémon Community Legend"] },
  { key: "onepiece", label: "One Piece Arena", emoji: "🏴‍☠️",
    titles: ["Grand Line Champion", "Pirate King Contender", "Arena Legend"] },
  { key: "mtg", label: "Magic Arena", emoji: "🪄",
    titles: ["Archmage", "Planeswalker Champion", "Arena Legend"] },
  { key: "yugioh", label: "Yu-Gi-Oh! Arena", emoji: "🐉",
    titles: ["Duel Champion", "Arena Master", "Community Legend"] },
  { key: "sports", label: "Sports Arena", emoji: "🏆",
    titles: ["Hall of Fame Champion", "League Legend", "Arena Master"] },
  { key: "lorcana", label: "Lorcana Arena", emoji: "🏰",
    titles: ["Illumineer Champion", "Inkcaster", "Arena Legend"] },
  { key: "marvel", label: "Marvel Arena", emoji: "🦸",
    titles: ["Avenger Champion", "Cosmic Contender", "Arena Legend"] },
  { key: "starwars", label: "Star Wars Arena", emoji: "🌌",
    titles: ["Jedi Champion", "Galactic Contender", "Arena Legend"] },
  { key: "wrestling", label: "Wrestling Arena", emoji: "🤼",
    titles: ["Title Holder", "Main Eventer", "Hall of Fame Legend"] },
  { key: "other", label: "Open Arena", emoji: "⚔️",
    titles: ["Rising Star", "Arena Veteran", "Arena Legend"] },
];

export const ARENA_CATEGORY_MAP: Record<ArenaCategory, ArenaCategoryMeta> =
  Object.fromEntries(ARENA_CATEGORIES.map((c) => [c.key, c])) as Record<ArenaCategory, ArenaCategoryMeta>;

// Map any free-form card category to a canonical Arena category.
export function arenaCategoryFor(category: string | null | undefined): ArenaCategory {
  const key = normalizeTcgCategory(category);
  return (ARENA_CATEGORY_MAP[key as ArenaCategory] ? key : "other") as ArenaCategory;
}

export function arenaCategoryMeta(key: string | null | undefined): ArenaCategoryMeta {
  return ARENA_CATEGORY_MAP[(key as ArenaCategory)] ?? ARENA_CATEGORY_MAP.other;
}

export function arenaCategoryLabel(key: string | null | undefined): string {
  return arenaCategoryMeta(key).label;
}
