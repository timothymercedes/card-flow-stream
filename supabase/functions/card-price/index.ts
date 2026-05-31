// Multi-source price aggregator with caching, outlier removal, and fallback.
// POST { card_id?, name?, set?, number? } → { price, sources, cached, ... }
//
// - 6h cache via card_price_cache
// - Pulls TCGplayer (via PokémonTCG card payload, primary) + PriceCharting (fallback)
// - Drops >2σ outliers, returns aggregated market/low/mid/high
// - Logs every fresh quote into card_price_history for owned trend data
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  searchPokemonTcg,
  aggregatePrices,
  tcgplayerQuoteFromCard,
  ygoQuoteFromCard,
  scryfallQuoteFromCard,
  tcgPricesQuoteFromCard,
  type PriceQuote,
  type NormalizedCard,
  type Source,
} from "../_shared/cards/sources.ts";
import { enabledProviders, pricingProviders } from "../_shared/cards/providers.ts";
import { resolveGame, categoryToGameId, type Game } from "../_shared/cards/games.ts";
import { upsertIdentity, setIdentityMarketPrice, recordObservation } from "../_shared/cards/identity.ts";

function pricingProvidersSkipped(active: { id: string }[]) {
  const activeIds = new Set(active.map((p) => p.id));
  return pricingProviders.filter((p) => !activeIds.has(p.id)).map((p) => p.id);
}

// Per-source extractor used when we resolved a card via the game's catalog
// adapter. Avoids defaulting to Pokémon/TCGplayer for non-Pokémon cards.
function quoteFromCardForSource(card: NormalizedCard, desiredVariant?: string | null): PriceQuote | null {
  switch (card.source) {
    case "tcg_api": return tcgplayerQuoteFromCard(card, desiredVariant);
    case "tcgdex": return tcgplayerQuoteFromCard(card, desiredVariant); // tcgdex returns pokemon shape
    case "ygoprodeck": return ygoQuoteFromCard(card);
    case "scryfall": return scryfallQuoteFromCard(card);
    case "tcg_prices": return tcgPricesQuoteFromCard(card);
    default: return null;
  }
}

// Tokens that change a card's identity / price (parallels, variants, rookies).
const VARIANT_TOKENS = [
  "holo","reverse","reverse holo","1st edition","first edition","unlimited","shadowless",
  "foil","etched","extended","borderless","showcase","retro","promo","alt art","alternate art",
  "full art","secret","rainbow","gold","silver","prizm","refractor","mosaic","optic","select",
  "donruss","rookie","rc","auto","autograph","relic","patch","numbered","ssp","sp",
  "parallel","variant","stamped","staff","prerelease",
];
function tokensOf(s: string | null | undefined): Set<string> {
  const t = String(s || "").toLowerCase();
  const out = new Set<string>();
  for (const tok of VARIANT_TOKENS) if (t.includes(tok)) out.add(tok);
  return out;
}

function scoreCard(
  c: NormalizedCard,
  q: { name?: string; number?: string; set?: string; year?: string; variant?: string },
) {
  const norm = (s: string | null | undefined) =>
    String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  let s = 0;
  // Name (40)
  if (q.name) {
    const a = norm(c.name), b = norm(q.name);
    if (a === b) s += 40;
    else if (a.startsWith(b) || b.startsWith(a)) s += 28;
    else if (a.includes(b) || b.includes(a)) s += 16;
  }
  // Collector number (30) — the single strongest disambiguator between two
  // cards that share a name. Weighted above the name so set/number wins over
  // a name-only match.
  if (q.number) {
    const cn = String(c.number || "").split("/")[0].trim().replace(/^0+(\d)/, "$1");
    const qn = String(q.number).split("/")[0].trim().replace(/^0+(\d)/, "$1");
    if (cn && cn === qn) s += 30;
    else if (cn && qn && (cn.startsWith(qn) || qn.startsWith(cn))) s += 10;
    else if (cn && qn) s -= 10; // both have numbers but they differ → wrong printing
  }
  // Set (22)
  if (q.set) {
    const a = norm(c.set_name), b = norm(q.set);
    if (a === b) s += 22;
    else if (a.includes(b) || b.includes(a)) s += 11;
  }
  // Year (10)
  if (q.year && c.year) {
    if (String(c.year) === String(q.year)) s += 10;
    else if (Math.abs(Number(c.year) - Number(q.year)) <= 1) s += 4;
  }
  // Variant / parallel tokens (12, with stronger penalty for mismatch). Variant
  // is value-defining (Full Art / IR / SIR / Promo / Stamped, etc.) so a
  // candidate that lacks the variant the OCR clearly saw is heavily penalized.
  const ocrTokens = tokensOf(`${q.variant || ""} ${q.name || ""}`);
  const cardTokens = tokensOf(`${c.name} ${c.rarity || ""} ${(c.variants || []).join(" ")}`);
  if (ocrTokens.size) {
    let matched = 0;
    for (const t of ocrTokens) if (cardTokens.has(t)) matched++;
    if (matched) s += Math.min(12, matched * 5);
    else s -= 12; // OCR saw "full art/holo/refractor" but candidate has none → penalize
  }
  if (c.image_small || c.image_large) s += 2;
  return s;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function cacheKey(card_id: string, name: string, set: string, number: string) {
  if (card_id) return `id:${card_id}`;
  return `q:${name.toLowerCase()}|${set.toLowerCase()}|${number.toLowerCase()}`;
}

// JustTCG game slugs. JustTCG covers live TCGplayer pricing (incl. variants)
// for these games; others fall through to the standard provider chain.
const JUSTTCG_GAME: Record<string, string> = {
  pokemon: "pokemon",
  mtg: "magic-the-gathering",
  yugioh: "yugioh",
  onepiece: "one-piece-card-game",
  lorcana: "disney-lorcana",
};

function jtFirstNumber(v: string | null | undefined) {
  return String(v || "").split("/")[0].trim().replace(/^0+(\d)/, "$1").toLowerCase();
}

// Map our internal language codes (en/jp/zh/...) to the canonical English
// language NAME JustTCG (and most price sources) use. Critical for pulling
// the correct language-specific market value — a Japanese card must never be
// priced from an English product record and vice versa.
const LANG_CODE_TO_NAME: Record<string, string> = {
  en: "English", jp: "Japanese", ja: "Japanese", kr: "Korean", ko: "Korean",
  zh: "Chinese", "zh-cn": "Chinese", "zh-tw": "Chinese", cn: "Chinese",
  de: "German", fr: "French", es: "Spanish", it: "Italian", pt: "Portuguese", ru: "Russian",
};
function normalizeLanguageName(input: string | null | undefined): string {
  const raw = String(input || "").trim();
  if (!raw) return "English";
  const lower = raw.toLowerCase();
  if (LANG_CODE_TO_NAME[lower]) return LANG_CODE_TO_NAME[lower];
  // Already a full name (e.g. "Japanese", "Chinese (Traditional)")
  if (/japan/.test(lower)) return "Japanese";
  if (/korea/.test(lower)) return "Korean";
  if (/chin|中文|mandarin/.test(lower)) return "Chinese";
  if (/germ|deutsch/.test(lower)) return "German";
  if (/fren|français/.test(lower)) return "French";
  if (/span|español/.test(lower)) return "Spanish";
  if (/ital/.test(lower)) return "Italian";
  if (/portug/.test(lower)) return "Portuguese";
  if (/russ/.test(lower)) return "Russian";
  if (/engl/.test(lower)) return "English";
  // Unknown — capitalize first letter as a best effort
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}
// True when a JustTCG variant's language matches the requested language.
// English requests also accept variants with no language tag (most cards).
function variantLangMatches(v: any, wantLang: string): boolean {
  const vl = String(v?.language || "").trim();
  if (wantLang === "English") return !vl || /engl/i.test(vl);
  return vl.toLowerCase() === wantLang.toLowerCase();
}

// Pick the JustTCG variant whose printing matches the desired variant; if no
// hint, prefer the premium printing (holo/reverse) and Near-Mint condition,
// falling back to the highest-priced variant. This is what produces the
// correct ~$34 Clefairy holo value instead of a $0.75 base-normal price.
// `wantLang` is the canonical language NAME — we ONLY consider variants in
// that language so we never cross-price languages.
function pickJustTcgVariant(card: any, variantHint: string | null, wantLang = "English") {
  const hint = String(variantHint || "").toLowerCase();
  const all = (card?.variants || []).filter(
    (v: any) => Number(v?.price) > 0 && variantLangMatches(v, wantLang),
  );
  if (!all.length) return null;
  const nm = all.filter((v: any) => v.condition === "Near Mint");
  const pool = nm.length ? nm : all;
  const wantReverse = /reverse/.test(hint);
  const wantHolo = !wantReverse && /(holo|foil|ultra|secret|illustration|alt art|full art|rainbow)/.test(hint);
  const wantNormal = /\bnon ?holo\b|^normal$/.test(hint);
  let pick =
    wantReverse ? pool.find((v: any) => /reverse/i.test(v.printing)) :
    wantHolo ? pool.find((v: any) => /holo/i.test(v.printing) && !/reverse/i.test(v.printing)) :
    wantNormal ? pool.find((v: any) => /normal/i.test(v.printing)) :
    null;
  if (!pick) pick = pool.slice().sort((a: any, b: any) => (b.price || 0) - (a.price || 0))[0];
  return pick || null;
}

// Real TCGplayer-backed pricing via JustTCG. Returns a high-trust quote plus
// the matched product identifiers for the card-page "Market Source" panel.
async function fetchJustTcgQuote(
  gameId: string,
  q: { name: string; set?: string | null; number?: string | null; variant?: string | null; language?: string | null },
): Promise<PriceQuote | null> {
  const wantLang = normalizeLanguageName(q.language);
  const apiKey = Deno.env.get("JUSTTCG_API_KEY");
  const slug = JUSTTCG_GAME[gameId];
  if (!apiKey || !slug || !q.name) return null;
  const cleanName = q.name.replace(/"/g, "").trim();
  const cleanSet = String(q.set || "").replace(/"/g, "").trim();
  const cleanNumber = jtFirstNumber(q.number);
  const queries: string[] = [];
  if (cleanName && cleanSet && cleanNumber) queries.push(`${cleanName} ${cleanSet} ${cleanNumber}`);
  if (cleanName && cleanNumber) queries.push(`${cleanName} ${cleanNumber}`);
  if (cleanName && cleanSet) queries.push(`${cleanName} ${cleanSet}`);
  if (cleanName) queries.push(cleanName);

  const seen = new Set<string>();
  const candidates: any[] = [];
  for (const query of queries) {
    try {
      const url = `https://api.justtcg.com/v1/cards?game=${slug}&q=${encodeURIComponent(query)}&limit=20`;
      const r = await fetch(url, { headers: { "X-API-Key": apiKey, "User-Agent": "PullBidLive/1.0" } });
      if (!r.ok) continue;
      const j = await r.json();
      for (const c of j?.data || []) {
        if (!c?.id || seen.has(c.id)) continue;
        seen.add(c.id);
        candidates.push(c);
      }
      if (candidates.length >= 20) break;
    } catch (e) {
      console.warn("[card-price][justtcg] fetch error:", (e as Error)?.message);
    }
  }
  if (!candidates.length) return null;

  const tName = cleanName.toLowerCase();
  const tSet = cleanSet.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  function score(c: any) {
    let s = 0;
    const cn = String(c.name || "").toLowerCase();
    const cnum = jtFirstNumber(c.number);
    const cset = String(c.set_name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (cleanNumber && cnum === cleanNumber) s += 50;
    else if (cleanNumber && String(c.number || "").includes(cleanNumber)) s += 15;
    if (cn === tName) s += 25;
    else if (cn.startsWith(tName)) s += 12;
    else if (cn.includes(tName) || tName.includes(cn)) s += 6;
    if (tSet && (cset === tSet || cset.includes(tSet) || tSet.includes(cset))) s += 20;
    if ((c.variants || []).some((v: any) => Number(v.price) > 0)) s += 3;
    return s;
  }
  const ranked = candidates
    .map((c) => ({ c, s: score(c), v: pickJustTcgVariant(c, q.variant ?? null, wantLang) }))
    .filter((x) => x.v && Number(x.v.price) > 0)
    .sort((a, b) => b.s - a.s);
  if (!ranked.length) return null;
  const top = ranked[0];
  // Require a minimally plausible match before trusting the price.
  if (top.s < 25) return null;

  const conds: Record<string, number> = {};
  for (const v of (top.c.variants || [])) {
    if (v.printing === top.v.printing && variantLangMatches(v, wantLang) && Number(v.price) > 0) {
      conds[v.condition] = Number(v.price);
    }
  }
  const market = Number(conds["Near Mint"] ?? top.v.price);
  const vals = Object.values(conds);
  return {
    source: "justtcg",
    market,
    low: vals.length ? Math.min(...vals) : market,
    mid: conds["Lightly Played"] ?? market,
    high: market,
    currency: "USD",
    url: top.c?.tcgplayerId ? `https://www.tcgplayer.com/product/${top.c.tcgplayerId}` : null,
    variant_used: top.v.printing ?? null,
    product_id: top.c?.tcgplayerId ? String(top.c.tcgplayerId) : (top.c?.id ?? null),
    raw: { justtcg_id: top.c?.id, tcgplayerId: top.c?.tcgplayerId, printing: top.v.printing, language: wantLang, conditions: conds, match_score: top.s },
  };
}


// catalog/sold source returned a price. Always clearly labeled downstream so
// the UI can flag it as an estimate (never as verified market data).
async function estimatePriceWithAI(q: {
  name: string; set?: string | null; number?: string | null;
  category?: string | null; variant?: string | null; year?: string | null; language?: string | null;
}): Promise<{ market: number; low: number; high: number } | null> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey || !q.name) return null;
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You are a trading-card and collectibles market appraiser covering Pokémon, Magic, Yu-Gi-Oh!, One Piece, Lorcana, Dragon Ball, Flesh and Blood, Weiss Schwarz, Digimon, sports cards, and other collectibles. Estimate the current RAW Near-Mint USD market value based on recent sold prices you know of. CRITICAL: price the SPECIFIC LANGUAGE printing requested — English, Japanese, Chinese, Korean, etc. often have very different market values, so never substitute another language's value. Return STRICT JSON only: {\"market\": number, \"low\": number, \"high\": number}. All values > 0. low/high should bracket realistic recent sold prices. If totally unknown, give your single best guess, never 0.",
          },
          {
            role: "user",
            content: `Estimate the recent sold market value (USD, raw NM) for this card:\nName: ${q.name}\nLanguage: ${q.language || "English"}\nCategory: ${q.category || "unknown"}\nSet: ${q.set || "unknown"}\nNumber: ${q.number || "unknown"}\nYear: ${q.year || "unknown"}\nVariant: ${q.variant || "standard"}`,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 80,
      }),
    });
    if (!resp.ok) return null;
    const j = await resp.json();
    const parsed = JSON.parse(j.choices?.[0]?.message?.content || "{}");
    const market = Number(parsed.market);
    if (!isFinite(market) || market <= 0) return null;
    const low = Number(parsed.low) > 0 ? Number(parsed.low) : Math.round(market * 0.7 * 100) / 100;
    const high = Number(parsed.high) > 0 ? Number(parsed.high) : Math.round(market * 1.4 * 100) / 100;
    return {
      market: Math.round(market * 100) / 100,
      low: Math.round(Math.min(low, market) * 100) / 100,
      high: Math.round(Math.max(high, market) * 100) / 100,
    };
  } catch (e) {
    console.warn("[card-price] AI estimate failed:", (e as Error)?.message);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const t0 = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const card_id = String(body?.card_id || "").trim();
    const name = String(body?.name || "").trim();
    const set = String(body?.set || "").trim();
    const number = String(body?.number || "").trim();
    const skipCache = !!body?.skip_cache;
    // Language: pull pricing for the CORRECT language printing only. We never
    // cross-price (a Japanese card must not get an English market value).
    const languageName = normalizeLanguageName(body?.language);
    const isEnglish = languageName === "English";
    const langCode = String(body?.language || "en").toLowerCase();
    const incomingIdentityId = body?.identity_id ? String(body.identity_id) : null;
    // game routing: accept either an explicit `game` id or a scanner `category`
    // string. When provided and non-Pokémon, we route through the matching
    // catalog adapters instead of defaulting to PokémonTCG.
    const gameId: Game = (body?.game ? body.game : categoryToGameId(body?.category)) || "pokemon";
    const game = resolveGame(gameId);
    if (!card_id && !name) {
      return new Response(JSON.stringify({ error: "card_id or name required" }), {
        status: 400, headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const key = `${game.id}|lang:${languageName.toLowerCase()}|${cacheKey(card_id, name, set, number)}`;

    // 1) Cache lookup — keep stale row around to use as fallback if all live providers fail.
    let staleCachePayload: any = null;
    if (!skipCache) {
      const { data: cached } = await admin.from("card_price_cache")
        .select("payload,expires_at").eq("card_key", key).maybeSingle();
      if (cached) {
        if (new Date(cached.expires_at).getTime() > Date.now()) {
          return new Response(JSON.stringify({ ...(cached.payload as object), cached: true }), {
            headers: { ...corsHeaders, "content-type": "application/json" },
          });
        }
        staleCachePayload = cached.payload;
      }
    }

    // 2) Resolve a card. Pokémon keeps the local `pokemon_cards` cache;
    //    every other game routes through its declared catalog adapter chain.
    const variant = String(body?.variant || "").trim();
    const year = String(body?.year || "").trim();
    let card: NormalizedCard | null = null;
    const catalogTried: string[] = [];
    let bestScore = 0;
    let topCandidates: NormalizedCard[] = [];
    if (card_id && game.id === "pokemon") {
      const { data: row } = await admin.from("pokemon_cards")
        .select("id,name,set_name,set_code,number,rarity,year,image_small,image_large,raw,source_ids")
        .eq("id", card_id).maybeSingle();
      if (row) {
        card = {
          id: row.id, source: "local",
          source_ids: (row.source_ids as Record<string,string>) || { tcg_api: row.id },
          name: row.name, set_name: row.set_name, set_code: row.set_code,
          number: row.number, rarity: row.rarity, year: row.year,
          image_small: row.image_small, image_large: row.image_large,
          variants: [], raw: row.raw,
        };
      }
    }
    if (!card && name) {
      const candidates: NormalizedCard[] = [];
      for (const adapter of game.catalog) {
        catalogTried.push(adapter.id);
        try {
          const rows = await adapter.search({ name, number, set, limit: 6 });
          candidates.push(...rows);
        } catch (e) {
          console.warn(`[card-price] adapter ${adapter.id} failed:`, (e as Error)?.message);
        }
        if (candidates.length) {
          const ranked = candidates
            .map((c) => ({ c, s: scoreCard(c, { name, number, set, variant, year }) }))
            .sort((a, b) => b.s - a.s);
          topCandidates = ranked.slice(0, 3).map((r) => r.c);
          if (ranked[0].s >= 70) { card = ranked[0].c; bestScore = ranked[0].s; break; }
        }
      }
      if (!card && candidates.length) {
        const ranked = candidates
          .map((c) => ({ c, s: scoreCard(c, { name, number, set, variant, year }) }))
          .sort((a, b) => b.s - a.s);
        card = ranked[0].c;
        bestScore = ranked[0].s;
        topCandidates = ranked.slice(0, 3).map((r) => r.c);
      }
    }

    // 3) Gather quotes.
    //    For non-Pokémon games, the per-source extractor on the resolved card
    //    is the primary signal (Scryfall for MTG, YGOPRODeck for YGO, local
    //    tcg_prices cache for One Piece / Lorcana / DBSFW / SWU / FaB). We
    //    still run the cross-cutting provider list (PriceCharting, eBay sold,
    //    PSA, …) when those are enabled — they apply to every game.
    const providers = enabledProviders();
    const sourcesTried: string[] = [...catalogTried];
    const sourcesFailed: string[] = [];
    const sourcesSkipped = pricingProvidersSkipped(providers);

    const q = {
      name: card?.name || name,
      set: card?.set_name || set || null,
      number: card?.number || number || null,
    };

    const quotes: PriceQuote[] = [];
    // Game-specific quote from the resolved card.
    if (card) {
      const direct = quoteFromCardForSource(card, variant);
      if (direct) quotes.push(direct);
    }
    // Cross-cutting providers — skip the Pokémon-only tcgplayerProvider for
    // non-Pokémon games (it would just return null but spends a round-trip).
    const applicable = providers.filter((p) => {
      if (p.id === "tcg_api") return game.id === "pokemon";
      return true;
    });
    const settled = await Promise.all(applicable.map(async (p) => {
      sourcesTried.push(p.id);
      try {
        const quote = await p.quote(card, q);
        if (!quote) { sourcesFailed.push(p.id); return null; }
        return quote;
      } catch (e) {
        console.warn(`[card-price] ${p.id} threw`, e);
        sourcesFailed.push(p.id);
        return null;
      }
    }));
    for (const s of settled) if (s) quotes.push(s);

    // JustTCG — real, variant-aware TCGplayer pricing (primary trusted source).
    sourcesTried.push("justtcg");
    try {
      const jt = await fetchJustTcgQuote(game.id, {
        name: q.name, set: q.set, number: q.number, variant, language: languageName,
      });
      if (jt) quotes.push(jt);
      else sourcesFailed.push("justtcg");
    } catch (e) {
      console.warn("[card-price] justtcg threw", (e as Error)?.message);
      sourcesFailed.push("justtcg");
    }

    const aggregated = aggregatePrices(quotes);

    // Confidence = identity match × pricing coverage × source agreement.
    const matchFactor = Math.min(1, bestScore / 100);
    const coverage = quotes.length ? Math.min(1, quotes.length / 2) : 0;
    const marketVals = quotes.map((qq) => qq.market).filter((n): n is number => typeof n === "number" && n > 0);
    let agreement = 1;
    if (marketVals.length >= 2) {
      const mean = marketVals.reduce((a, b) => a + b, 0) / marketVals.length;
      const spread = (Math.max(...marketVals) - Math.min(...marketVals)) / Math.max(1, mean);
      agreement = Math.max(0.3, 1 - Math.min(1, spread));
    }
    const confidence = Math.round(matchFactor * (0.6 + 0.4 * coverage * agreement) * 100) / 100;

    const officialImage = card?.image_large || card?.image_small || null;
    const imageSource: string | null = card?.source ?? null;

    // ---- Tiered pricing ----------------------------------------------------
    // verified   : exact match + real market data + at least one trusted source
    // estimated  : we have *some* signal (stale cache, single source, or only
    //              similar-card comps) but not enough to call it exact
    // unavailable: no reliable data anywhere → never fabricate a number
    const market = aggregated.market;
    const candidateMarkets: number[] = topCandidates
      .map((c) => quoteFromCardForSource(c, variant)?.market)
      .filter((n): n is number => typeof n === "number" && n > 0);

    let pricingTier: "verified" | "estimated" | "unavailable" = "unavailable";
    let priceRange: { low: number; high: number } | null = null;
    let tierReason = "";
    let priceIsAI = false;

    const trustedSources = quotes.filter((qq) =>
      ["justtcg", "tcg_api", "scryfall", "ygoprodeck", "tcg_prices", "tcgdex", "pricecharting", "psa", "ebay_sold"].includes(qq.source),
    ).length;

    // AI fallback: ONLY when no real source, no similar-card comp, and no stale
    // cache produced a price. AI never overrides real sold-market data.
    let aiPrice: { market: number; low: number; high: number } | null = null;
    const noRealData =
      !(market && market > 0) &&
      candidateMarkets.length === 0 &&
      !(staleCachePayload?.price?.market);
    if (noRealData && (q.name || name)) {
      aiPrice = await estimatePriceWithAI({
        name: q.name || name,
        set: q.set || set,
        number: q.number || number,
        category: body?.category || game.id,
        variant,
        year,
        language: languageName,
      });
    }

    if (market && market > 0 && bestScore >= 80 && trustedSources >= 1 && !(staleCachePayload && (aggregated.market == null))) {
      pricingTier = "verified";
      tierReason = `Verified by ${aggregated.primary_source} (match ${bestScore}/100, ${quotes.length} source${quotes.length === 1 ? "" : "s"}).`;
    } else if (market && market > 0) {
      pricingTier = "estimated";
      const lo = aggregated.low ?? Math.max(0.5, Math.round(market * 0.7 * 100) / 100);
      const hi = aggregated.high ?? Math.round(market * 1.4 * 100) / 100;
      priceRange = { low: lo, high: hi };
      tierReason = bestScore < 80
        ? `Estimated — identity match is only ${bestScore}/100. Confirm the card to lock in a verified price.`
        : `Estimated — only one source returned a price.`;
    } else if (candidateMarkets.length >= 1) {
      pricingTier = "estimated";
      const lo = Math.min(...candidateMarkets);
      const hi = Math.max(...candidateMarkets);
      priceRange = {
        low: Math.round(lo * 100) / 100,
        high: Math.round(Math.max(hi, lo * 1.1) * 100) / 100,
      };
      tierReason = `Estimated from ${candidateMarkets.length} similar card${candidateMarkets.length === 1 ? "" : "s"} — no exact match yet.`;
    } else if (aiPrice) {
      pricingTier = "estimated";
      priceIsAI = true;
      priceRange = { low: aiPrice.low, high: aiPrice.high };
      tierReason = "AI-estimated value — no real sold-market data was found for this card. Verify or set the price manually.";
    } else {
      pricingTier = "unavailable";
      tierReason = "No reliable market data. Set price manually or check recent sold listings.";
    }

    const finalPrice = priceIsAI && aiPrice
      ? { market: aiPrice.market, low: aiPrice.low, mid: null as number | null, high: aiPrice.high, currency: "USD" }
      : {
          market: aggregated.market,
          low: aggregated.low,
          mid: aggregated.mid,
          high: aggregated.high,
          currency: aggregated.currency,
        };

    const primarySource = priceIsAI ? "ai_estimate" : aggregated.primary_source;
    const finalConfidence = priceIsAI ? Math.min(confidence, 0.35) : confidence;
    const priceConfidence: "high" | "medium" | "low" = priceIsAI
      ? "low"
      : pricingTier === "verified" && finalConfidence >= 0.75
        ? "high"
        : pricingTier === "verified"
          ? "medium"
          : pricingTier === "estimated" && finalConfidence >= 0.55
            ? "medium"
            : "low";

    // ---- Pricing verification / suspicious-value detection -----------------
    // Cross-check the chosen market value against (a) similar-card comps and
    // (b) recent logged sold prices for this card. A value that is wildly
    // below the reference (e.g. $0.75 when comps sit at $30–$50) almost always
    // means the wrong product/variant record was matched. Flag it so the UI
    // can mark the card for re-sync instead of trusting a bogus number.
    const chosenQuote =
      quotes.find((qq) => qq.source === "justtcg" && qq.product_id) ||
      quotes.find((qq) => qq.product_id) ||
      (card ? quoteFromCardForSource(card, variant) : null);
    const chosenMarket = (finalPrice as any).market as number | null;
    const refValues: number[] = [...candidateMarkets];
    try {
      const histKey = card?.id || `${name}|${set}|${number}`.toLowerCase();
      const { data: hist } = await admin.from("card_price_history")
        .select("market_price")
        .eq("card_key", histKey)
        .order("created_at", { ascending: false })
        .limit(20);
      for (const h of hist || []) {
        const v = Number((h as any).market_price);
        if (isFinite(v) && v > 0) refValues.push(v);
      }
    } catch (_e) { /* history is best-effort */ }
    const sortedRef = refValues.filter((v) => v > 0).sort((a, b) => a - b);
    const refMedian = sortedRef.length
      ? sortedRef[Math.floor(sortedRef.length / 2)]
      : null;
    let priceSuspicious = false;
    let needsResync = false;
    let suspiciousReason: string | null = null;
    if (
      !priceIsAI &&
      chosenMarket != null && chosenMarket > 0 &&
      refMedian != null && refMedian >= 5 &&
      chosenMarket < refMedian * 0.4
    ) {
      priceSuspicious = true;
      needsResync = true;
      suspiciousReason =
        `Assigned value $${chosenMarket.toFixed(2)} is far below the reference ` +
        `~$${refMedian.toFixed(2)} from ${sortedRef.length} comps/recent sales — ` +
        `likely a wrong product or variant match. Flagged for re-sync.`;
    }

    // External identifiers + last sync for the card-page "Market Source" panel.
    const pcQuote = quotes.find((qq) => qq.source === "pricecharting");
    const marketSource = {
      tcgplayer_product_id: chosenQuote?.product_id ?? null,
      tcgplayer_url: chosenQuote?.url ?? null,
      pricecharting_product_id: pcQuote?.product_id ?? null,
      pricecharting_url: pcQuote?.url ?? null,
      variant_used: chosenQuote?.variant_used ?? variant ?? null,
      last_sync: new Date().toISOString(),
    };

    // Did a trusted market source actually return data in the requested language?
    const jtQuote = quotes.find((qq) => qq.source === "justtcg");
    const languageMatched = !!(jtQuote && normalizeLanguageName((jtQuote.raw as any)?.language) === languageName);
    // Non-English requested but we could not confirm language-specific market
    // data → tell the UI to flag it rather than passing off another printing.
    const languageUnconfirmed = !isEnglish && !languageMatched;

    let payload: any = {
      game: game.id,
      language: languageName,
      language_matched: languageMatched,
      language_unconfirmed: languageUnconfirmed,
      card: card ? {
        id: card.id, name: card.name, set_name: card.set_name, number: card.number,
        rarity: card.rarity, year: card.year,
        image_small: card.image_small, image_large: card.image_large,
        source_ids: card.source_ids,
        match_score: bestScore,
      } : null,
      candidates: topCandidates.map((c) => ({
        id: c.id,
        name: c.name,
        set_name: c.set_name,
        number: c.number,
        rarity: c.rarity,
        year: c.year,
        variant: (c.variants || [])[0] || null,
        image_url: c.image_large || c.image_small || null,
        image_source: c.source,
        match_score: scoreCard(c, { name, number, set, variant, year }),
        market: quoteFromCardForSource(c, variant)?.market ?? null,
      })),
      official_image_url: officialImage,
      image_source: imageSource,
      price: finalPrice,
      pricing_tier: priceSuspicious ? "estimated" : pricingTier,
      price_range: priceRange,
      tier_reason: priceSuspicious ? suspiciousReason : tierReason,
      price_suspicious: priceSuspicious,
      needs_resync: needsResync,
      suspicious_reason: suspiciousReason,
      reference_value: refMedian,
      market_source: marketSource,
      price_is_ai: priceIsAI,
      price_confidence: priceSuspicious ? "low" : priceConfidence,
      confidence: priceSuspicious ? Math.min(finalConfidence, 0.3) : finalConfidence,
      sources: aggregated.sources,
      sources_tried: sourcesTried,
      sources_failed: sourcesFailed,
      sources_skipped: sourcesSkipped,
      primary_source: primarySource,
      cached: false,
      stale: false,
      duration_ms: Date.now() - t0,
    };

    // Cached-pricing protection: if no live provider returned a price, fall
    // back to the most recent stale cache so the UI shows the last known
    // value with a stale flag instead of $0. Stale fallback never qualifies
    // as `verified` — downgrade to `estimated`.
    if ((aggregated.market == null) && staleCachePayload?.price?.market) {
      const stalePrice = staleCachePayload.price;
      const lo = stalePrice.low ?? Math.round(stalePrice.market * 0.7 * 100) / 100;
      const hi = stalePrice.high ?? Math.round(stalePrice.market * 1.4 * 100) / 100;
      payload = {
        ...staleCachePayload, ...payload,
        price: stalePrice,
        pricing_tier: "estimated",
        price_range: { low: lo, high: hi },
        tier_reason: "Estimated — using last known cached price. Live sources unavailable right now.",
        stale: true,
        confidence: Math.min(confidence, 0.5),
      };
    }

    // 3.5) Master card identity — the card (not the user) owns its identity and
    // price. Resolve/insert the canonical record (source of truth for card
    // INFORMATION) and persist the market value. Provider keys remain the
    // market-data lookup keys; the master UUID is the card-info source of truth.
    const providerKey = card?.id || null;
    let identityId: string | null = incomingIdentityId;
    try {
      const providerKeys = [
        providerKey,
        marketSource.tcgplayer_product_id ? `tcgplayer:${marketSource.tcgplayer_product_id}` : null,
        marketSource.pricecharting_product_id ? `pricecharting:${marketSource.pricecharting_product_id}` : null,
      ].filter(Boolean) as string[];
      const verificationStatus = payload.pricing_tier === "verified"
        ? "verified"
        : (payload.price_is_ai ? "unverified" : "estimated");
      console.log("[card-price] resolving master identity", JSON.stringify({
        name: card?.name || name, provider_key: providerKey, language: langCode,
      }));
      const resolvedId = await upsertIdentity({
        category: (game.id as any),
        name: card?.name || name,
        set_name: card?.set_name || set || null,
        set_code: card?.set_code || null,
        number: card?.number || number || null,
        year: card?.year ? Number(card.year) : (year ? Number(year) : null),
        variant: variant || null,
        language: langCode,
        rarity: (card as any)?.rarity || null,
        image_url: officialImage,
        image_source: imageSource,
        confidence_score: typeof payload.confidence === "number" ? payload.confidence : null,
        verification_status: verificationStatus as any,
        provider_keys: providerKeys,
        external_ids: {
          ...(card?.source_ids || {}),
          ...(marketSource.tcgplayer_product_id ? { tcgplayer: String(marketSource.tcgplayer_product_id) } : {}),
          ...(marketSource.pricecharting_product_id ? { pricecharting: String(marketSource.pricecharting_product_id) } : {}),
        },
      });
      identityId = resolvedId || incomingIdentityId;
      console.log("[card-price] master identity resolved", identityId);
      const mkt = (payload.price as any)?.market as number | null;
      if (identityId && typeof mkt === "number" && mkt > 0) {
        await setIdentityMarketPrice({
          identity_id: identityId,
          market_cents: Math.round(mkt * 100),
          source: payload.primary_source || null,
          verification_status: verificationStatus as any,
        });
        await recordObservation({
          identity_id: identityId,
          source: payload.primary_source || "aggregate",
          price_cents: Math.round(mkt * 100),
        });
      }
    } catch (e) {
      console.warn("[card-price] identity persist failed", (e as Error)?.message);
    }
    // master_identity_id = card-info source of truth (UUID);
    // provider_key / identity_id kept for the working pricing + back-compat paths.
    payload.master_identity_id = identityId;
    payload.provider_key = providerKey;
    payload.identity_id = identityId;



    // 4) Cache and history (fire-and-forget)
    if (card?.id || name) {
      admin.from("card_price_cache").upsert({
        card_key: key,
        payload,
        expires_at: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "card_key" }).then(({ error }) => {
        if (error) console.warn("price cache", error.message);
      });
    }
    if (quotes.length && (card?.id || name)) {
      const histLangSuffix = isEnglish ? "" : `|lang:${languageName.toLowerCase()}`;
      const rows = quotes.map((q) => ({
        card_key: (card?.id || `${name}|${set}|${number}`.toLowerCase()) + histLangSuffix,
        name: card?.name || name,
        tcg_set: card?.set_name || set || null,
        tcg_number: card?.number || number || null,
        market_price: q.market,
        price_low: q.low,
        price_high: q.high,
        last_sold_price: null,
        source: q.source,
        mid: q.mid,
        currency: q.currency,
        payload: q.raw ?? {},
      }));
      admin.from("card_price_history").insert(rows).then(({ error }) => {
        if (error) console.warn("price history", error.message);
      });
    }

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (e) {
    console.error("card-price", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
