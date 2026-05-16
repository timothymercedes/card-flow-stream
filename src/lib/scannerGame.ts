// Map a free-form scanner category (from scan-card) to a canonical game id
// understood by the card-price / card-catalog edge functions.
export type ScannerGame =
  | "pokemon"
  | "yugioh"
  | "mtg"
  | "onepiece"
  | "lorcana"
  | "dbs_fusion"
  | "swu"
  | "fab"
  | "sports"
  | "other";

export function categoryToGameId(category: string | null | undefined): ScannerGame {
  const c = String(category || "").toLowerCase();
  if (!c) return "pokemon";
  if (/pok[eé]mon/.test(c)) return "pokemon";
  if (/yu.?gi.?oh|ygo/.test(c)) return "yugioh";
  if (/magic|mtg|gathering/.test(c)) return "mtg";
  if (/one ?piece/.test(c)) return "onepiece";
  if (/lorcana|disney/.test(c)) return "lorcana";
  if (/dragon ?ball|dbs|fusion world/.test(c)) return "dbs_fusion";
  if (/star ?wars|swu/.test(c)) return "swu";
  if (/flesh.*blood|\bfab\b/.test(c)) return "fab";
  if (/sport|topps|panini|upper deck|bowman|donruss|fleer|score/.test(c)) return "sports";
  return "other";
}

export function isPokemonCategory(category: string | null | undefined) {
  return categoryToGameId(category) === "pokemon";
}
