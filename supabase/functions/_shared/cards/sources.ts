// Shared multi-source card catalog + pricing helpers.
// All third-party calls are wrapped with timeout, retry, and a process-local
// circuit breaker so a single bad source can never stall the chain.

export type Source =
  | "tcg_api"        // PokémonTCG API (catalog + bundled TCGplayer prices)
  | "tcgdex"         // TCGdex (catalog fallback)
  | "ygoprodeck"     // Yu-Gi-Oh! catalog + TCGplayer/CardMarket prices
  | "scryfall"       // Magic: The Gathering catalog + price hints
  | "justtcg"        // JustTCG aggregated pricing (where supported)
  | "tcg_prices"     // local tcg_prices cache (One Piece / Lorcana / DBSFW / SWU / FaB)
  | "pricecharting"  // PriceCharting (disabled until paid key + ENABLE_PRICECHARTING=1)
  | "ebay_sold"      // eBay sold comps (planned)
  | "psa"            // PSA pop/price (planned)
  | "local"          // local Supabase cache
  | "manual";

export interface NormalizedCard {
  id: string;                 // canonical id (prefer tcg_api id, else tcgdex id)
  source: Source;
  source_ids: Record<string, string>;
  name: string;
  set_name: string | null;
  set_code: string | null;
  number: string | null;
  rarity: string | null;
  year: string | null;
  image_small: string | null;
  image_large: string | null;
  variants: string[];
  raw: unknown;
}

export interface PriceQuote {
  source: Source;
  market: number | null;
  low: number | null;
  mid: number | null;
  high: number | null;
  currency: string;
  url?: string | null;
  raw?: unknown;
  // The specific TCGplayer printing/variant this quote was taken from
  // (e.g. "holofoil", "reverseHolofoil", "normal"). Used downstream to
  // verify the price belongs to the same variant as the identified card.
  variant_used?: string | null;
  // External product identifiers for the card-page "Market Source" display.
  product_id?: string | null;
}

// --- circuit breaker ---------------------------------------------------------
const breaker = new Map<string, { fails: number; openUntil: number }>();
function isOpen(key: string) {
  const s = breaker.get(key);
  return !!(s && s.openUntil > Date.now());
}
function recordFail(key: string) {
  const s = breaker.get(key) || { fails: 0, openUntil: 0 };
  s.fails += 1;
  if (s.fails >= 3) {
    s.openUntil = Date.now() + 5 * 60 * 1000; // 5 min
    s.fails = 0;
  }
  breaker.set(key, s);
}
function recordOk(key: string) {
  breaker.delete(key);
}

// --- fetch with retry + timeout ---------------------------------------------
export async function safeFetch(
  key: string,
  url: string,
  init: RequestInit = {},
  { timeoutMs = 8000, retries = 2 } = {},
): Promise<Response | null> {
  if (isOpen(key)) return null;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(t);
      if (res.ok) {
        recordOk(key);
        return res;
      }
      // 4xx (except 429) → don't retry
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        recordFail(key);
        return null;
      }
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
    }
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, 250 * Math.pow(2, attempt)));
    }
  }
  console.warn(`[sources] ${key} failed:`, String(lastErr).slice(0, 200));
  recordFail(key);
  return null;
}

// --- adapters ---------------------------------------------------------------
function pokemonTcgIdFromTcgdex(tcgdexId: string): string {
  // tcgdex uses "set_id-number" e.g. "swsh1-25" which maps 1:1 to PokémonTCG.
  return tcgdexId;
}

export async function searchPokemonTcg(
  q: { name?: string; number?: string; set?: string },
  limit = 6,
): Promise<NormalizedCard[]> {
  const apiKey = Deno.env.get("POKEMONTCG_API_KEY");
  const parts: string[] = [];
  if (q.name) parts.push(`name:"${q.name.replace(/"/g, "")}"`);
  if (q.number) {
    const n = String(q.number).split("/")[0].trim();
    if (n) parts.push(`number:"${n}"`);
  }
  if (q.set) parts.push(`set.name:"${q.set.replace(/"/g, "")}"`);
  if (!parts.length) return [];
  const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(parts.join(" "))}&pageSize=${limit}`;
  const res = await safeFetch("tcg_api", url, {
    headers: apiKey ? { "X-Api-Key": apiKey } : {},
  });
  if (!res) return [];
  try {
    const j = await res.json();
    const list = Array.isArray(j?.data) ? j.data : [];
    return list.map((c: any): NormalizedCard => ({
      id: String(c.id),
      source: "tcg_api",
      source_ids: { tcg_api: String(c.id) },
      name: c.name ?? "",
      set_name: c.set?.name ?? null,
      set_code: c.set?.id ?? null,
      number: c.number ?? null,
      rarity: c.rarity ?? null,
      year: c.set?.releaseDate ? String(c.set.releaseDate).slice(0, 4) : null,
      image_small: c.images?.small ?? null,
      image_large: c.images?.large ?? null,
      variants: Object.keys(c?.tcgplayer?.prices ?? {}),
      raw: c,
    }));
  } catch {
    return [];
  }
}

export async function searchTcgdex(
  q: { name?: string; number?: string },
  limit = 6,
): Promise<NormalizedCard[]> {
  if (!q.name) return [];
  const params = new URLSearchParams();
  params.set("name", `like:${q.name}`);
  if (q.number) params.set("localId", String(q.number).split("/")[0].trim());
  const url = `https://api.tcgdex.net/v2/en/cards?${params.toString()}`;
  const res = await safeFetch("tcgdex", url);
  if (!res) return [];
  try {
    const list = await res.json();
    const slice = Array.isArray(list) ? list.slice(0, limit) : [];
    // The list endpoint returns sparse cards; fetch each for full detail in parallel
    const detailed = await Promise.all(slice.map(async (entry: any) => {
      const dRes = await safeFetch("tcgdex", `https://api.tcgdex.net/v2/en/cards/${entry.id}`);
      if (!dRes) return null;
      try {
        const c = await dRes.json();
        const img = c.image ? `${c.image}/high.png` : null;
        const imgSm = c.image ? `${c.image}/low.png` : null;
        const tcgId = pokemonTcgIdFromTcgdex(String(c.id));
        return {
          id: tcgId,
          source: "tcgdex" as Source,
          source_ids: { tcgdex: String(c.id), tcg_api: tcgId },
          name: c.name ?? "",
          set_name: c.set?.name ?? null,
          set_code: c.set?.id ?? null,
          number: c.localId ?? null,
          rarity: c.rarity ?? null,
          year: c.set?.releaseDate ? String(c.set.releaseDate).slice(0, 4) : null,
          image_small: imgSm,
          image_large: img,
          variants: Array.isArray(c.variants) ? Object.keys(c.variants).filter((k) => (c.variants as any)[k]) : [],
          raw: c,
        } satisfies NormalizedCard;
      } catch {
        return null;
      }
    }));
    return detailed.filter(Boolean) as NormalizedCard[];
  } catch {
    return [];
  }
}

// --- price extractors -------------------------------------------------------
export function tcgplayerQuoteFromCard(card: NormalizedCard): PriceQuote | null {
  const raw = card.raw as any;
  const prices = raw?.tcgplayer?.prices;
  if (!prices) return null;
  const variants = ["holofoil", "normal", "reverseHolofoil", "1stEditionHolofoil", "unlimitedHolofoil"];
  let market = null, low = null, mid = null, high = null;
  for (const v of variants) {
    const p = prices[v];
    if (!p) continue;
    market ??= p.market ?? null;
    low ??= p.low ?? null;
    mid ??= p.mid ?? null;
    high ??= p.high ?? null;
    if (market) break;
  }
  if (market == null && low == null && mid == null && high == null) return null;
  return {
    source: "tcg_api", // TCGplayer prices are bundled in the PokémonTCG API response
    market, low, mid, high,
    currency: "USD",
    url: raw?.tcgplayer?.url ?? null,
    raw: prices,
  };
}

export async function fetchPriceCharting(
  q: { name: string; set?: string | null; number?: string | null },
): Promise<PriceQuote | null> {
  const key = Deno.env.get("PRICECHARTING_API_KEY");
  if (!key) return null;
  const queryParts = [q.name];
  if (q.set) queryParts.push(q.set);
  if (q.number) queryParts.push(String(q.number).split("/")[0]);
  const query = encodeURIComponent(queryParts.filter(Boolean).join(" "));
  const url = `https://www.pricecharting.com/api/product?t=${encodeURIComponent(key)}&q=${query}`;
  const res = await safeFetch("pricecharting", url);
  if (!res) return null;
  try {
    const j = await res.json();
    if (j?.status !== "success") return null;
    // PriceCharting returns prices in cents.
    const toUsd = (n: any) => (typeof n === "number" && n > 0 ? n / 100 : null);
    const loose = toUsd(j["loose-price"]);
    const cib = toUsd(j["cib-price"]);
    const newP = toUsd(j["new-price"]);
    const market = cib ?? loose ?? newP;
    const all = [loose, cib, newP].filter((n): n is number => n != null);
    return {
      source: "pricecharting",
      market,
      low: all.length ? Math.min(...all) : null,
      mid: market,
      high: all.length ? Math.max(...all) : null,
      currency: "USD",
      url: j.id ? `https://www.pricecharting.com/game/${j.id}` : null,
      raw: j,
    };
  } catch {
    return null;
  }
}

// --- aggregation ------------------------------------------------------------
export interface AggregatedPrice {
  market: number | null;
  low: number | null;
  mid: number | null;
  high: number | null;
  currency: string;
  sources: PriceQuote[];
  primary_source: Source | null;
}

// Source weights — higher = more trusted in the weighted median.
const SOURCE_WEIGHTS: Record<string, number> = {
  tcg_api: 3,
  scryfall: 3,
  ygoprodeck: 2,
  tcg_prices: 2,
  tcgdex: 2,
  pricecharting: 3,
  ebay_sold: 3,
  psa: 4,
};
const weightFor = (s: string) => SOURCE_WEIGHTS[s] ?? 1;

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function weightedMedian(pairs: Array<{ v: number; w: number }>): number | null {
  if (!pairs.length) return null;
  const sorted = [...pairs].sort((a, b) => a.v - b.v);
  const total = sorted.reduce((s, p) => s + p.w, 0);
  let acc = 0;
  for (const p of sorted) {
    acc += p.w;
    if (acc >= total / 2) return p.v;
  }
  return sorted[sorted.length - 1].v;
}

// Drop outliers > 2x the (plain) median — more robust than mean+sd when
// one provider returns a wildly stale or wrong number.
function dropOutliersByMedian(values: number[]): number[] {
  if (values.length < 3) return values;
  const m = median(values);
  if (!m || m <= 0) return values;
  return values.filter((v) => v <= m * 2 && v >= m / 2);
}

export function aggregatePrices(quotes: PriceQuote[]): AggregatedPrice {
  const valid = quotes.filter((q) => q && (q.market || q.low || q.mid || q.high));
  if (!valid.length) {
    return { market: null, low: null, mid: null, high: null, currency: "USD", sources: quotes, primary_source: null };
  }
  const marketPairs = valid
    .map((q) => (typeof q.market === "number" && q.market > 0 ? { v: q.market, w: weightFor(q.source) } : null))
    .filter((p): p is { v: number; w: number } => !!p);
  const filteredMarkets = dropOutliersByMedian(marketPairs.map((p) => p.v));
  const filteredPairs = marketPairs.filter((p) => filteredMarkets.includes(p.v));
  const lows = valid.map((q) => q.low).filter((n): n is number => typeof n === "number" && n > 0);
  const highs = valid.map((q) => q.high).filter((n): n is number => typeof n === "number" && n > 0);
  const mids = valid.map((q) => q.mid).filter((n): n is number => typeof n === "number" && n > 0);
  return {
    market: weightedMedian(filteredPairs),
    low: lows.length ? Math.min(...lows) : null,
    mid: median(mids),
    high: highs.length ? Math.max(...highs) : null,
    currency: valid[0].currency || "USD",
    sources: valid,
    // Primary = highest-weight contributing source after outlier removal.
    primary_source:
      [...filteredPairs].sort((a, b) => b.w - a.w)[0]
        ? valid.find((q) => q.market === [...filteredPairs].sort((a, b) => b.w - a.w)[0].v)?.source ?? valid[0].source
        : valid[0].source,
  };
}

// ============================================================================
// Multi-game catalog adapters (free / no-key sources)
// ============================================================================

// --- Yu-Gi-Oh! via YGOPRODeck (free, no key) -------------------------------
export async function searchYugioh(
  q: { name?: string },
  limit = 8,
): Promise<NormalizedCard[]> {
  if (!q.name) return [];
  const url = `https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(q.name)}&num=${limit}&offset=0`;
  const res = await safeFetch("ygoprodeck", url);
  if (!res) return [];
  try {
    const j = await res.json();
    const list: any[] = Array.isArray(j?.data) ? j.data.slice(0, limit) : [];
    return list.map((c): NormalizedCard => {
      const set = Array.isArray(c.card_sets) ? c.card_sets[0] : null;
      const img = Array.isArray(c.card_images) ? c.card_images[0] : null;
      const tcgPrice = Array.isArray(c.card_prices) ? c.card_prices[0] : null;
      return {
        id: `ygo:${c.id}`,
        source: "ygoprodeck",
        source_ids: { ygoprodeck: String(c.id) },
        name: String(c.name ?? ""),
        set_name: set?.set_name ?? null,
        set_code: set?.set_code ?? null,
        number: set?.set_code ?? null,
        rarity: set?.set_rarity ?? c.rarity ?? null,
        year: null,
        image_small: img?.image_url_small ?? null,
        image_large: img?.image_url ?? null,
        variants: [],
        raw: { ...c, _firstPrice: tcgPrice },
      };
    });
  } catch {
    return [];
  }
}

export function ygoQuoteFromCard(card: NormalizedCard): PriceQuote | null {
  const raw = card.raw as any;
  const p = raw?._firstPrice;
  if (!p) return null;
  const market = Number(p.tcgplayer_price) || Number(p.cardmarket_price) || null;
  if (market == null) return null;
  return {
    source: "ygoprodeck",
    market, low: market, mid: market, high: market,
    currency: "USD",
    raw: p,
  };
}

// --- MTG via Scryfall (free, no key) ---------------------------------------
export async function searchScryfallMtg(
  q: { name?: string; set?: string | null; number?: string | null },
  limit = 8,
): Promise<NormalizedCard[]> {
  if (!q.name) return [];
  const parts = [q.name];
  if (q.set) parts.push(`set:${q.set}`);
  if (q.number) parts.push(`number:${String(q.number).split("/")[0].trim()}`);
  const url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(parts.join(" "))}&unique=cards&order=released`;
  const res = await safeFetch("scryfall", url);
  if (!res) return [];
  try {
    const j = await res.json();
    const list: any[] = Array.isArray(j?.data) ? j.data.slice(0, limit) : [];
    return list.map((c): NormalizedCard => ({
      id: `mtg:${c.id}`,
      source: "scryfall",
      source_ids: { scryfall: String(c.id) },
      name: String(c.name ?? ""),
      set_name: c.set_name ?? null,
      set_code: c.set ?? null,
      number: c.collector_number ?? null,
      rarity: c.rarity ?? null,
      year: c.released_at ? String(c.released_at).slice(0, 4) : null,
      image_small: c.image_uris?.small ?? c.card_faces?.[0]?.image_uris?.small ?? null,
      image_large: c.image_uris?.large ?? c.card_faces?.[0]?.image_uris?.large ?? null,
      variants: [c.finishes ?? []].flat(),
      raw: c,
    }));
  } catch {
    return [];
  }
}

export function scryfallQuoteFromCard(card: NormalizedCard): PriceQuote | null {
  const raw = card.raw as any;
  const p = raw?.prices;
  if (!p) return null;
  const market = Number(p.usd) || Number(p.usd_foil) || null;
  if (market == null) return null;
  return {
    source: "scryfall",
    market, low: market, mid: market, high: market,
    currency: "USD",
    url: raw?.purchase_uris?.tcgplayer ?? null,
    raw: p,
  };
}

// --- Local tcg_prices cache lookup (multi-game) ----------------------------
// Reads from the `tcg_prices` table populated by sync-tcgcsv. No outbound
// network — pure DB query, used as the catalog source for games without a
// free public catalog API (One Piece, Lorcana, DBS Fusion, SWU, FaB).
export async function searchTcgPricesTable(
  game: string,
  q: { name?: string; number?: string; set?: string },
  limit = 8,
): Promise<NormalizedCard[]> {
  if (!q.name) return [];
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return [];
  const clean = String(q.name).toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, " ").trim();
  const params = new URLSearchParams({
    select: "tcgplayer_product_id,name,set_name,number,rarity,image_url,market_price,low_price,mid_price,high_price",
    game: `eq.${game}`,
    clean_name: `ilike.*${clean}*`,
    limit: String(limit),
  });
  if (q.number) params.append("number", `eq.${String(q.number).split("/")[0].trim()}`);
  if (q.set) params.append("set_name", `ilike.*${q.set}*`);
  const res = await safeFetch(
    `tcg_prices:${game}`,
    `${url}/rest/v1/tcg_prices?${params.toString()}`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!res) return [];
  try {
    const rows: any[] = await res.json();
    return rows.map((r): NormalizedCard => ({
      id: `tcgp:${game}:${r.tcgplayer_product_id}`,
      source: "tcg_prices",
      source_ids: { tcgplayer: String(r.tcgplayer_product_id) },
      name: r.name,
      set_name: r.set_name ?? null,
      set_code: null,
      number: r.number ?? null,
      rarity: r.rarity ?? null,
      year: null,
      image_small: r.image_url ?? null,
      image_large: r.image_url ?? null,
      variants: [],
      raw: r,
    }));
  } catch {
    return [];
  }
}

export function tcgPricesQuoteFromCard(card: NormalizedCard): PriceQuote | null {
  if (card.source !== "tcg_prices") return null;
  const r = card.raw as any;
  const market = Number(r?.market_price) || null;
  if (market == null && !r?.low_price && !r?.high_price) return null;
  return {
    source: "tcg_prices",
    market,
    low: Number(r?.low_price) || null,
    mid: Number(r?.mid_price) || null,
    high: Number(r?.high_price) || null,
    currency: "USD",
  };
}
