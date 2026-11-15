/** Stage 2 qualification rules (pure). A variant is sellable only with live stock, a confirmed US shipping quote and >= $2 net profit. */
export const MIN_NET_PROFIT_CENTS = 200;
export const REQUALIFY_AFTER_HOURS = 20; // public projection hides options after 24h without a fresh check

export type QualifyInput = { stock: number | null; shippingConfirmed: boolean; shippingCents: number | null; priceCents: number | null; profitCents: number | null; belowFloor: boolean };
export type QualifyReason = "out_of_stock" | "no_us_shipping" | "below_floor" | "no_price";

export function qualifyVariant(v: QualifyInput): { ok: true } | { ok: false; reason: QualifyReason } {
  if (v.stock == null || v.stock <= 0) return { ok: false, reason: "out_of_stock" };
  if (!v.shippingConfirmed || v.shippingCents == null) return { ok: false, reason: "no_us_shipping" };
  if (v.priceCents == null || v.priceCents <= 0) return { ok: false, reason: "no_price" };
  if (v.belowFloor || v.profitCents == null || v.profitCents < MIN_NET_PROFIT_CENTS) return { ok: false, reason: "below_floor" };
  return { ok: true };
}

/** Product publishes only when at least one option qualifies; otherwise the most common failure is recorded. */
export function productDecision(results: ({ ok: true } | { ok: false; reason: QualifyReason })[]): { publish: true } | { publish: false; reason: QualifyReason | "no_options" } {
  if (!results.length) return { publish: false, reason: "no_options" };
  if (results.some((r) => r.ok)) return { publish: true };
  const n: Record<string, number> = {};
  for (const r of results) if (!r.ok) n[r.reason] = (n[r.reason] ?? 0) + 1;
  return { publish: false, reason: Object.entries(n).sort((a, b) => b[1] - a[1])[0][0] as QualifyReason };
}
