// Shared category list for the marketplace. Add/remove as the catalog grows.
export const LISTING_CATEGORIES = [
  { value: "pokemon", label: "Pokémon", emoji: "⚡" },
  { value: "one_piece", label: "One Piece", emoji: "🏴‍☠️" },
  { value: "magic", label: "Magic: The Gathering", emoji: "🪄" },
  { value: "yugioh", label: "Yu-Gi-Oh!", emoji: "🐉" },
  { value: "dragon_ball", label: "Dragon Ball", emoji: "🐲" },
  { value: "lorcana", label: "Disney Lorcana", emoji: "🏰" },
  { value: "digimon", label: "Digimon", emoji: "🦖" },
  { value: "weiss", label: "Weiss Schwarz", emoji: "♟️" },
  { value: "sports", label: "Sports Cards", emoji: "🏆" },
  { value: "funko", label: "Funko Pops", emoji: "🎁" },
  { value: "manga", label: "Manga & Comics", emoji: "📚" },
  { value: "anime_figures", label: "Anime Figures", emoji: "🗡️" },
  { value: "plush", label: "Plush & Toys", emoji: "🧸" },
  { value: "memorabilia", label: "Memorabilia", emoji: "🪙" },
  { value: "supplies", label: "Supplies & Sleeves", emoji: "🛡️" },
  { value: "other", label: "Other Collectibles", emoji: "✨" },
] as const;

export type ListingCategory = (typeof LISTING_CATEGORIES)[number]["value"];

export function categoryLabel(value: string | null | undefined) {
  return LISTING_CATEGORIES.find((c) => c.value === value)?.label ?? null;
}
export function categoryEmoji(value: string | null | undefined) {
  return LISTING_CATEGORIES.find((c) => c.value === value)?.emoji ?? "✨";
}
