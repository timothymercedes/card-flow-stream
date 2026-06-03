// Canonical TCG category keys used across PullBid Live.
// Vault cards and card identities store free-form category strings
// ("Pokémon", "Yu-Gi-Oh!", "Magic: The Gathering", ...). The card_sets
// master table is keyed on canonical slugs. This normalizer maps any input
// to the canonical key so set-completion lookups match the right game.
//
// Adding a future TCG: seed its sets into card_sets with a new canonical
// key, then add the aliases here. Nothing else needs to change.

export const TCG_CATEGORIES = [
  "pokemon",
  "mtg",
  "yugioh",
  "onepiece",
  "lorcana",
  "sports",
  "marvel",
  "wrestling",
  "starwars",
] as const;

export type TcgCategory = (typeof TCG_CATEGORIES)[number] | string;

const stripAccents = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function normalizeTcgCategory(input: unknown): string {
  const raw = stripAccents(String(input ?? "").toLowerCase().trim());
  if (!raw) return "other";
  const compact = raw.replace(/[^a-z0-9]/g, "");

  if (compact.includes("pokemon")) return "pokemon";
  if (compact.includes("yugioh") || raw.includes("yu gi oh")) return "yugioh";
  if (compact.includes("onepiece") || compact === "optcg") return "onepiece";
  if (
    compact.startsWith("mtg") ||
    compact.includes("magic") /* Magic / Magic: The Gathering */
  )
    return "mtg";
  if (compact.includes("lorcana")) return "lorcana";
  if (compact.includes("marvel")) return "marvel";
  if (compact.includes("starwars")) return "starwars";
  if (
    compact.includes("wrestling") ||
    compact.includes("wwe") ||
    compact.includes("aew")
  )
    return "wrestling";
  if (compact.startsWith("sport")) return "sports";

  return compact || "other";
}

const CATEGORY_LABELS: Record<string, string> = {
  pokemon: "Pokémon",
  mtg: "Magic: The Gathering",
  yugioh: "Yu-Gi-Oh!",
  onepiece: "One Piece",
  lorcana: "Disney Lorcana",
  sports: "Sports",
  marvel: "Marvel",
  wrestling: "Wrestling",
  starwars: "Star Wars",
  other: "Other",
};

export function tcgCategoryLabel(input: unknown): string {
  const key = normalizeTcgCategory(input);
  return CATEGORY_LABELS[key] ?? String(input ?? "Other");
}
