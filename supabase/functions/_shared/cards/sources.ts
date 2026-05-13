// Shared multi-source card catalog + pricing helpers.
// All third-party calls are wrapped with timeout, retry, and a process-local
// circuit breaker so a single bad source can never stall the chain.

export type Source = "tcg_api" | "tcgdex" | "pricecharting" | "local" | "manual";

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

function dropOutliers(values: number[]): number[] {
  if (values.length < 3) return values;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
  if (sd === 0) return values;
  return values.filter((v) => Math.abs(v - mean) <= 2 * sd);
}

export function aggregatePrices(quotes: PriceQuote[]): AggregatedPrice {
  const valid = quotes.filter((q) => q && (q.market || q.low || q.mid || q.high));
  if (!valid.length) {
    return { market: null, low: null, mid: null, high: null, currency: "USD", sources: quotes, primary_source: null };
  }
  const markets = dropOutliers(valid.map((q) => q.market).filter((n): n is number => typeof n === "number" && n > 0));
  const lows = valid.map((q) => q.low).filter((n): n is number => typeof n === "number" && n > 0);
  const highs = valid.map((q) => q.high).filter((n): n is number => typeof n === "number" && n > 0);
  const mids = valid.map((q) => q.mid).filter((n): n is number => typeof n === "number" && n > 0);
  const avg = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  return {
    market: avg(markets),
    low: lows.length ? Math.min(...lows) : null,
    mid: avg(mids),
    high: highs.length ? Math.max(...highs) : null,
    currency: valid[0].currency || "USD",
    sources: valid,
    primary_source: valid[0].source,
  };
}
