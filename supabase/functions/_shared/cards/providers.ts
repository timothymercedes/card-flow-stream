// Pricing provider registry. Provider-agnostic so new sources (PriceCharting,
// eBay sold comps, PSA, etc.) can be plugged in without touching call sites.
//
// A provider:
//   - declares an `id` (matches Source)
//   - reports `enabled()` based on env / config (default: false for paid APIs)
//   - implements `quote(card, query)` returning a PriceQuote or null
//
// The aggregator iterates ENABLED providers in parallel. Disabled providers
// are silently skipped — no failed-source noise, no extra network calls.

import {
  type NormalizedCard,
  type PriceQuote,
  type Source,
  fetchPriceCharting,
  tcgplayerQuoteFromCard,
} from "./sources.ts";

export interface PriceQuery {
  name: string;
  set?: string | null;
  number?: string | null;
}

export interface PricingProvider {
  id: Source;
  label: string;
  enabled: () => boolean;
  quote: (card: NormalizedCard | null, q: PriceQuery) => Promise<PriceQuote | null>;
}

const flag = (name: string) => {
  const v = Deno.env.get(name);
  return v === "1" || v === "true";
};

// --- Active provider: TCGplayer (via PokémonTCG API payload) ---------------
export const tcgplayerProvider: PricingProvider = {
  id: "tcg_api",
  label: "TCGplayer (via PokémonTCG)",
  enabled: () => true, // free, primary source
  quote: async (card) => (card ? tcgplayerQuoteFromCard(card) : null),
};

// --- Opt-in provider: PriceCharting (paid) ---------------------------------
// Requires BOTH a key AND an explicit ENABLE_PRICECHARTING=1 flag so we
// never silently start incurring API costs.
export const priceChartingProvider: PricingProvider = {
  id: "pricecharting",
  label: "PriceCharting",
  enabled: () =>
    flag("ENABLE_PRICECHARTING") && !!Deno.env.get("PRICECHARTING_API_KEY"),
  quote: async (_card, q) => fetchPriceCharting(q),
};

// --- Planned providers (stubs — wired but disabled) ------------------------
export const ebaySoldCompsProvider: PricingProvider = {
  id: "ebay_sold",
  label: "eBay Sold Comps",
  enabled: () => flag("ENABLE_EBAY_SOLD") && !!Deno.env.get("EBAY_APP_ID"),
  quote: async () => null, // TODO: implement Browse API sold-listings adapter
};

export const psaProvider: PricingProvider = {
  id: "psa",
  label: "PSA",
  enabled: () => flag("ENABLE_PSA") && !!Deno.env.get("PSA_API_TOKEN"),
  quote: async () => null, // TODO: implement PSA cert + auction price adapter
};

// --- Registry --------------------------------------------------------------
// Order matters: the first enabled provider that returns a quote becomes the
// `primary_source` in the aggregator output.
export const pricingProviders: PricingProvider[] = [
  tcgplayerProvider,
  priceChartingProvider,
  ebaySoldCompsProvider,
  psaProvider,
];

export function enabledProviders(): PricingProvider[] {
  return pricingProviders.filter((p) => {
    try { return p.enabled(); } catch { return false; }
  });
}
