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
  { value: "other", label: "Other", emoji: "✨" },
] as const;

export type TcgTag = (typeof TCG_TAGS)[number]["value"];

export function streamTypeMeta(value: string | null | undefined) {
  return STREAM_TYPES.find((s) => s.value === value);
}
export function tcgTagMeta(value: string | null | undefined) {
  return TCG_TAGS.find((t) => t.value === value);
}
