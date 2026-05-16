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

function pricingProvidersSkipped(active: { id: string }[]) {
  const activeIds = new Set(active.map((p) => p.id));
  return pricingProviders.filter((p) => !activeIds.has(p.id)).map((p) => p.id);
}

// Per-source extractor used when we resolved a card via the game's catalog
// adapter. Avoids defaulting to Pokémon/TCGplayer for non-Pokémon cards.
function quoteFromCardForSource(card: NormalizedCard): PriceQuote | null {
  switch (card.source) {
    case "tcg_api": return tcgplayerQuoteFromCard(card);
    case "tcgdex": return tcgplayerQuoteFromCard(card); // tcgdex returns pokemon shape
    case "ygoprodeck": return ygoQuoteFromCard(card);
    case "scryfall": return scryfallQuoteFromCard(card);
    case "tcg_prices": return tcgPricesQuoteFromCard(card);
    default: return null;
  }
}

function scoreCard(c: NormalizedCard, q: { name?: string; number?: string; set?: string }) {
  const norm = (s: string | null | undefined) =>
    String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  let s = 0;
  if (q.name) {
    const a = norm(c.name), b = norm(q.name);
    if (a === b) s += 50;
    else if (a.startsWith(b) || b.startsWith(a)) s += 35;
    else if (a.includes(b) || b.includes(a)) s += 20;
  }
  if (q.number) {
    const cn = String(c.number || "").split("/")[0].trim().replace(/^0+(\d)/, "$1");
    const qn = String(q.number).split("/")[0].trim().replace(/^0+(\d)/, "$1");
    if (cn && cn === qn) s += 30;
  }
  if (q.set) {
    const a = norm(c.set_name), b = norm(q.set);
    if (a === b) s += 20;
    else if (a.includes(b) || b.includes(a)) s += 10;
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

    const key = cacheKey(card_id, name, set, number);

    // 1) Cache lookup
    if (!skipCache) {
      const { data: cached } = await admin.from("card_price_cache")
        .select("payload,expires_at").eq("card_key", key).maybeSingle();
      if (cached && new Date(cached.expires_at).getTime() > Date.now()) {
        return new Response(JSON.stringify({ ...(cached.payload as object), cached: true }), {
          headers: { ...corsHeaders, "content-type": "application/json" },
        });
      }
    }

    // 2) Resolve a card object (for TCGplayer prices)
    let card: NormalizedCard | null = null;
    if (card_id) {
      // try local first
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
      const list = await searchPokemonTcg({ name, number, set }, 1);
      card = list[0] ?? null;
    }

    // 3) Gather quotes from every ENABLED provider in parallel.
    //    Disabled providers (e.g. PriceCharting until paid key + flag) are skipped.
    const providers = enabledProviders();
    const sourcesTried: string[] = [];
    const sourcesFailed: string[] = [];
    const sourcesSkipped = pricingProvidersSkipped(providers);

    const q = {
      name: card?.name || name,
      set: card?.set_name || set || null,
      number: card?.number || number || null,
    };
    const settled = await Promise.all(providers.map(async (p) => {
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
    const quotes: PriceQuote[] = settled.filter((q): q is PriceQuote => !!q);

    const aggregated = aggregatePrices(quotes);

    const payload = {
      card: card ? {
        id: card.id, name: card.name, set_name: card.set_name, number: card.number,
        rarity: card.rarity, year: card.year,
        image_small: card.image_small, image_large: card.image_large,
        source_ids: card.source_ids,
      } : null,
      price: {
        market: aggregated.market,
        low: aggregated.low,
        mid: aggregated.mid,
        high: aggregated.high,
        currency: aggregated.currency,
      },
      sources: aggregated.sources,
      sources_tried: sourcesTried,
      sources_failed: sourcesFailed,
      sources_skipped: sourcesSkipped, // disabled providers (e.g. paid APIs without flag/key)
      primary_source: aggregated.primary_source,
      cached: false,
      duration_ms: Date.now() - t0,
    };

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
      const rows = quotes.map((q) => ({
        card_key: card?.id || `${name}|${set}|${number}`.toLowerCase(),
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
