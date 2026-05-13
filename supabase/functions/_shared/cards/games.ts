// Game registry — declares which categories the platform supports and which
// catalog/pricing adapters power each one. Adding a new game = one entry here
// + (optionally) a new catalog adapter in sources.ts.

import {
  searchPokemonTcg,
  searchTcgdex,
  searchYugioh,
  searchScryfallMtg,
  searchTcgPricesTable,
  type NormalizedCard,
} from "./sources.ts";

export type Game =
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

export interface CatalogQuery {
  name?: string;
  number?: string;
  set?: string;
  limit?: number;
}

export interface CatalogAdapter {
  id: string;                                   // e.g. "pokemontcg", "ygoprodeck"
  label: string;
  search: (q: CatalogQuery) => Promise<NormalizedCard[]>;
}

export interface GameDefinition {
  id: Game;
  label: string;
  // Ordered: first adapter is primary, rest are fallbacks. Empty arrays are
  // valid for games where pricing comes only from the cached `tcg_prices`
  // table (no live catalog API).
  catalog: CatalogAdapter[];
  // Whether the cached `tcg_prices` table (populated by sync-tcgcsv) carries
  // entries for this game — lets the catalog function add a local-cache
  // adapter automatically.
  hasTcgPricesCache: boolean;
}

// --- Adapter wrappers (thin so games.ts stays declarative) ----------------
const pokemontcg: CatalogAdapter = {
  id: "pokemontcg",
  label: "PokémonTCG.io",
  search: (q) => searchPokemonTcg({ name: q.name, number: q.number, set: q.set }, q.limit ?? 8),
};
const tcgdex: CatalogAdapter = {
  id: "tcgdex",
  label: "TCGdex",
  search: (q) => searchTcgdex({ name: q.name, number: q.number }, q.limit ?? 8),
};
const ygoprodeck: CatalogAdapter = {
  id: "ygoprodeck",
  label: "YGOPRODeck",
  search: (q) => searchYugioh({ name: q.name }, q.limit ?? 8),
};
const scryfall: CatalogAdapter = {
  id: "scryfall",
  label: "Scryfall (MTG)",
  search: (q) => searchScryfallMtg({ name: q.name, set: q.set, number: q.number }, q.limit ?? 8),
};
const tcgPricesAdapter = (game: string): CatalogAdapter => ({
  id: "tcg_prices_cache",
  label: "Local TCG cache",
  search: (q) => searchTcgPricesTable(game, { name: q.name, number: q.number, set: q.set }, q.limit ?? 8),
});

// --- Registry --------------------------------------------------------------
export const GAMES: Record<Game, GameDefinition> = {
  pokemon: {
    id: "pokemon",
    label: "Pokémon",
    catalog: [pokemontcg, tcgdex],
    hasTcgPricesCache: false,
  },
  yugioh: {
    id: "yugioh",
    label: "Yu-Gi-Oh!",
    catalog: [ygoprodeck],
    hasTcgPricesCache: false,
  },
  mtg: {
    id: "mtg",
    label: "Magic: The Gathering",
    catalog: [scryfall],
    hasTcgPricesCache: false,
  },
  onepiece: {
    id: "onepiece",
    label: "One Piece",
    catalog: [tcgPricesAdapter("One Piece")],
    hasTcgPricesCache: true,
  },
  lorcana: {
    id: "lorcana",
    label: "Disney Lorcana",
    catalog: [tcgPricesAdapter("Lorcana")],
    hasTcgPricesCache: true,
  },
  dbs_fusion: {
    id: "dbs_fusion",
    label: "Dragon Ball Super Fusion World",
    catalog: [tcgPricesAdapter("Dragon Ball Super Fusion")],
    hasTcgPricesCache: true,
  },
  swu: {
    id: "swu",
    label: "Star Wars Unlimited",
    catalog: [tcgPricesAdapter("Star Wars Unlimited")],
    hasTcgPricesCache: true,
  },
  fab: {
    id: "fab",
    label: "Flesh and Blood",
    catalog: [tcgPricesAdapter("Flesh and Blood")],
    hasTcgPricesCache: true,
  },
  sports: {
    id: "sports",
    label: "Sports cards",
    catalog: [],   // pricing-only via PriceCharting / eBay sold comps when enabled
    hasTcgPricesCache: false,
  },
  other: {
    id: "other",
    label: "Other collectibles",
    catalog: [],
    hasTcgPricesCache: false,
  },
};

export function resolveGame(g: string | undefined | null): GameDefinition {
  const key = String(g || "pokemon").toLowerCase().trim() as Game;
  return GAMES[key] ?? GAMES.pokemon;
}

export function listGames(): Array<Pick<GameDefinition, "id" | "label">> {
  return Object.values(GAMES).map((g) => ({ id: g.id, label: g.label }));
}
