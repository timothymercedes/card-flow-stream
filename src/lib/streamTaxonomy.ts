// Stream type + TCG tag taxonomy used by Sell, Show Off, and discovery filters.
export const STREAM_TYPES = [
  { value: "auction", label: "Auction", emoji: "🏷️" },
  { value: "break", label: "Break", emoji: "📦" },
  { value: "rip_ship", label: "Rip & Ship", emoji: "✂️" },
  { value: "show_off", label: "Show Off", emoji: "✨" },
  { value: "trade_night", label: "Trade Night", emoji: "🤝" },
  { value: "showcase", label: "Collection Showcase", emoji: "🏆" },
] as const;

export type StreamType = (typeof STREAM_TYPES)[number]["value"];

export const TCG_TAGS = [
  { value: "pokemon", label: "Pokémon", emoji: "⚡" },
  { value: "one_piece", label: "One Piece", emoji: "🏴‍☠️" },
  { value: "yugioh", label: "Yu-Gi-Oh!", emoji: "🐉" },
  { value: "magic", label: "Magic: The Gathering", emoji: "🪄" },
  { value: "sports", label: "Sports Cards", emoji: "🏆" },
  { value: "dragon_ball", label: "Dragon Ball Super", emoji: "🐲" },
  { value: "digimon", label: "Digimon", emoji: "🦖" },
  { value: "lorcana", label: "Lorcana", emoji: "🏰" },
  { value: "flesh_blood", label: "Flesh and Blood", emoji: "⚔️" },
  { value: "electronics", label: "Electronics & Tech", emoji: "💻" },
  { value: "fashion", label: "Fashion & Sneakers", emoji: "👟" },
  { value: "gaming", label: "Video Games", emoji: "🎮" },
  { value: "home", label: "Home & Living", emoji: "🛋️" },
  { value: "toys", label: "Toys & Figures", emoji: "🧸" },
  { value: "comics", label: "Comics", emoji: "📚" },
  { value: "watches_jewelry", label: "Watches & Jewelry", emoji: "⌚" },
  { value: "automotive", label: "Automotive", emoji: "🚗" },
  { value: "tools", label: "Tools", emoji: "🛠️" },
  { value: "random", label: "Random Sales", emoji: "🎲" },
  { value: "other", label: "Other", emoji: "✨" },
] as const;

/** Stored inside tcg_tags so mature rooms need no schema change. Never shown as a category chip. */
export const MATURE_TAG = "mature_language";
export const isMatureStream = (tags: readonly string[] | null | undefined) => !!tags?.includes(MATURE_TAG);

export type TcgTag = (typeof TCG_TAGS)[number]["value"];

export function streamTypeMeta(value: string | null | undefined) {
  return STREAM_TYPES.find((s) => s.value === value);
}
export function tcgTagMeta(value: string | null | undefined) {
  return TCG_TAGS.find((t) => t.value === value);
}
