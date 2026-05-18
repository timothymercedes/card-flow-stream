// Lightweight package presets optimized for TCG / collectibles.
// "stamp" and "pwe" are untracked options — Shippo / USPS APIs do NOT sell
// these labels, so we skip the carrier API and use a flat seller price.

export type ShippingPresetKey = "stamp" | "pwe" | "bubble" | "small_box";

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
  /** Default flat price in USD; sellers can override per profile. */
  flatPriceUsd?: number;
  /** True if the option is untracked (no tracking number). */
  untracked?: boolean;
  /** Mail classification hint for buyer-facing labels. */
  mailClass?: "letter" | "flat" | "package";
}

export const SHIPPING_PRESETS: Record<ShippingPresetKey, ShippingPreset> = {
  stamp: {
    key: "stamp",
    label: "Single Card (Stamp)",
    description: "1 USPS Forever stamp · 1–2 cards · untracked",
    weightOz: 1,
    lengthIn: 6,
    widthIn: 4,
    heightIn: 0.05,
    flatRate: true,
    flatPriceUsd: 0.78,
    untracked: true,
    mailClass: "letter",
  },
  pwe: {
    key: "pwe",
    label: "PWE (1 oz+)",
    description: "Plain White Envelope · 3–4 cards · untracked",
    weightOz: 1,
    lengthIn: 6,
    widthIn: 4,
    heightIn: 0.1,
    flatRate: true,
    flatPriceUsd: 0.99,
    untracked: true,
    mailClass: "flat",
  },
  bubble: {
    key: "bubble",
    label: "Bubble Mailer",
    description: "Tracked · card value $30+ or slab · 4 oz",
    weightOz: 4,
    lengthIn: 7,
    widthIn: 5,
    heightIn: 1,
    mailClass: "package",
  },
  small_box: {
    key: "small_box",
    label: "Small TCG Box",
    description: "Tracked · heavy (8 oz+) · booster box / multiple slabs",
    weightOz: 10,
    lengthIn: 8,
    widthIn: 6,
    heightIn: 4,
    mailClass: "package",
  },
};

const TCG_CATEGORIES = new Set([
  "pokemon", "one_piece", "magic", "yugioh", "dragon_ball",
  "lorcana", "digimon", "weiss", "sports",
]);

/**
 * Auto-pick a preset by quantity, order value and weight.
 * Rules:
 *   - Item value ≥ $30 OR slabbed → Bubble (Small Box if weight > 8oz)
 *   - 1–2 cards → Stamp
 *   - 3–4 cards → PWE
 *   - 5+ cards → Bubble (Small Box if weight > 8oz)
 */
export function suggestPreset(opts: {
  category?: string | null;
  quantity?: number | null;
  title?: string | null;
  /** Order value in USD — used to decide tracked vs untracked. */
  orderValueUsd?: number | null;
  /** Estimated package weight in oz. */
  weightOz?: number | null;
  /** Seller settings (from profile). */
  pweEnabled?: boolean;
  pweMaxOrderValue?: number;
}): ShippingPresetKey {
  const qty = Math.max(1, opts.quantity ?? 1);
  const title = (opts.title || "").toLowerCase();
  const cat = (opts.category || "").toLowerCase();
  const value = Number(opts.orderValueUsd ?? 0);
  const weightOz = Number(opts.weightOz ?? 0);
  const pweOk = opts.pweEnabled !== false;

  // Always-box overrides
  if (/booster\s*box|etb|elite trainer|case|bundle/.test(title)) return "small_box";
  if (/funko|plush|figure|memorabilia|supplies/.test(cat)) return "small_box";

  const isSlab = /slab|psa|bgs|cgc/.test(title);
  const heavy = weightOz > 8;

  // Force tracked for slabs or $30+ items
  if (isSlab || value >= 30) return heavy ? "small_box" : "bubble";

  // Quantity-based for cheap raw cards
  if (pweOk && qty <= 2) return "stamp";
  if (pweOk && qty <= 4) return "pwe";
  return heavy ? "small_box" : "bubble";
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

/**
 * Short, friendly capacity label for a shipping preset.
 * Used in seller-facing dropdowns ("Stamp · 1 card", "PWE · 1–3 cards", etc.).
 */
export function presetCapacityLabel(key: ShippingPresetKey): string {
  switch (key) {
    case "stamp": return "1–2 cards";
    case "pwe": return "3–4 cards";
    case "bubble": return "card $30+ / slab";
    case "small_box": return "heavy 8 oz+";
  }
}

/**
 * Estimated price for a preset given current order context.
 * Returns the flat seller price for stamp/PWE; otherwise a domestic estimate
 * matching estimateShippingAndImportFees() (kept in sync with that helper).
 */
export function presetEstimatedPriceUsd(
  key: ShippingPresetKey,
  opts: { subtotal?: number; quantity?: number } = {},
): number {
  const p = SHIPPING_PRESETS[key];
  if (p.flatRate && p.flatPriceUsd != null) return p.flatPriceUsd;
  const qty = Math.max(1, Number(opts.quantity || 1));
  const subtotal = Number(opts.subtotal || 0);
  const oz = Math.max(1, p.weightOz);
  const lowValueCard = subtotal <= 20 && oz <= 2;
  return lowValueCard ? 0.99 : 4.75 + Math.max(0, oz - 4) * 0.35;
}
