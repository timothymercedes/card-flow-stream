// Lightweight package presets optimized for TCG / collectibles.
// PWE is a stamp-only option — Shippo / USPS APIs do NOT sell PWE labels,
// so we skip the carrier API and use a flat seller price instead.

export type ShippingPresetKey = "pwe" | "bubble" | "small_box";

export interface ShippingPreset {
  key: ShippingPresetKey;
  label: string;
  description: string;
  weightOz: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  /** When true, skip Shippo and quote a flat seller-set price (PWE / letter mail). */
  flatRate?: boolean;
  /** Suggested flat price in USD for PWE (covers stamp + sleeve + top loader). */
  flatPriceUsd?: number;
}

export const SHIPPING_PRESETS: Record<ShippingPresetKey, ShippingPreset> = {
  pwe: {
    key: "pwe",
    label: "Single Card (PWE)",
    description: "Plain White Envelope · 1 oz",
    weightOz: 1,
    lengthIn: 6,
    widthIn: 4,
    heightIn: 0.1,
  },
  bubble: {
    key: "bubble",
    label: "Bubble Mailer",
    description: "Up to a few cards / small slab · 4 oz",
    weightOz: 4,
    lengthIn: 7,
    widthIn: 5,
    heightIn: 1,
  },
  small_box: {
    key: "small_box",
    label: "Small TCG Box",
    description: "Booster box / multiple slabs · 10 oz",
    weightOz: 10,
    lengthIn: 8,
    widthIn: 6,
    heightIn: 4,
  },
};

const TCG_CATEGORIES = new Set([
  "pokemon",
  "one_piece",
  "magic",
  "yugioh",
  "dragon_ball",
  "lorcana",
  "digimon",
  "weiss",
  "sports",
]);

/**
 * Auto-pick a preset based on listing category and quantity.
 * - Single TCG card → PWE
 * - 2-4 cards / sealed pack / small slab → Bubble
 * - Booster box, larger sets, supplies → Small Box
 */
export function suggestPreset(opts: {
  category?: string | null;
  quantity?: number | null;
  title?: string | null;
}): ShippingPresetKey {
  const cat = (opts.category || "").toLowerCase();
  const qty = Math.max(1, opts.quantity ?? 1);
  const title = (opts.title || "").toLowerCase();

  if (/booster\s*box|etb|elite trainer|case|bundle/.test(title)) return "small_box";
  if (/funko|plush|figure|memorabilia|supplies/.test(cat)) return "small_box";

  if (TCG_CATEGORIES.has(cat)) {
    if (qty === 1 && !/slab|psa|bgs|cgc/.test(title)) return "pwe";
    if (qty <= 4) return "bubble";
    return "small_box";
  }

  // Unknown category: be conservative but cheap
  if (qty === 1) return "bubble";
  return "small_box";
}

/**
 * Sort rates: cheapest first, but boost USPS Ground Advantage / USPS as the
 * recommended option for lightweight collectibles.
 */
export function sortRatesCheapestFirst<T extends { provider?: string; service?: string; amount?: string | number }>(
  rates: T[],
): T[] {
  return [...rates].sort((a, b) => {
    const aAmt = Number(a.amount ?? 0);
    const bAmt = Number(b.amount ?? 0);
    if (aAmt !== bAmt) return aAmt - bAmt;
    const aUsps = (a.provider || "").toLowerCase().includes("usps") ? 0 : 1;
    const bUsps = (b.provider || "").toLowerCase().includes("usps") ? 0 : 1;
    return aUsps - bUsps;
  });
}

/**
 * Pick the recommended cheapest rate. Prefers USPS Ground Advantage if it's
 * within $1 of the absolute cheapest; otherwise the lowest-priced option.
 */
export function pickRecommendedRate<T extends { provider?: string; service?: string; amount?: string | number }>(
  rates: T[],
): T | null {
  if (!rates.length) return null;
  const sorted = sortRatesCheapestFirst(rates);
  const cheapest = sorted[0];
  const cheapestAmt = Number(cheapest.amount ?? 0);
  const ga = sorted.find(
    (r) =>
      (r.provider || "").toLowerCase().includes("usps") &&
      /ground\s*advantage/i.test(r.service || ""),
  );
  if (ga && Number(ga.amount ?? 0) - cheapestAmt <= 1) return ga;
  return cheapest;
}
