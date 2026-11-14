export type PricingRule = {
  markup_percent: number; markup_fixed_cents: number; min_profit_cents: number; min_margin_percent: number;
  shipping_cost_cents: number; fee_percent: number; fee_fixed_cents: number; other_cost_cents: number; round_to_cents: number;
};
export type PriceResult = { priceCents: number; profitCents: number; marginPercent: number; belowFloor: boolean; floorCents: number };

const ceilTo = (n: number, step: number) => Math.ceil(n / Math.max(1, step)) * Math.max(1, step);

/** Profit after supplier cost, shipping, payment fees and other costs. */
export function profitAt(price: number, cost: number, r: PricingRule): number {
  return Math.round(price - cost - r.shipping_cost_cents - r.other_cost_cents - (price * Number(r.fee_percent)) / 100 - r.fee_fixed_cents);
}

/** Lowest price that satisfies both the minimum profit amount and the minimum margin. */
export function floorPrice(cost: number, r: PricingRule): number {
  const fixed = cost + r.shipping_cost_cents + r.other_cost_cents + r.fee_fixed_cents;
  const fee = Number(r.fee_percent) / 100;
  const byAmount = (fixed + r.min_profit_cents) / (1 - fee);
  const denom = 1 - fee - Number(r.min_margin_percent) / 100;
  const byMargin = denom > 0 ? fixed / denom : Infinity;
  return Math.ceil(Math.max(byAmount, byMargin));
}

export function computePrice(costCents: number, r: PricingRule, overrideCents?: number | null): PriceResult {
  if (!Number.isInteger(costCents) || costCents < 0) throw new Error("Supplier cost must be a whole number of cents.");
  const floor = floorPrice(costCents, r);
  const markup = costCents * (1 + Number(r.markup_percent) / 100) + r.markup_fixed_cents;
  const priceCents = overrideCents != null ? overrideCents : ceilTo(Math.max(markup, floor), r.round_to_cents);
  const profitCents = profitAt(priceCents, costCents, r);
  const marginPercent = priceCents > 0 ? Math.round((profitCents / priceCents) * 10000) / 100 : 0;
  return { priceCents, profitCents, marginPercent, belowFloor: priceCents < floor, floorCents: floor };
}

export type AvailabilityReason = "sold_out" | "unavailable" | "unverified" | null;
export function availabilityLabel(reason: AvailabilityReason): string {
  return reason === "sold_out" ? "SOLD OUT" : reason === "unverified" ? "Temporarily unavailable" : reason === "unavailable" ? "Unavailable" : "In stock";
}
export function deliveryWindow(min?: number | null, max?: number | null): string | null {
  if (min == null || max == null) return null;
  return min === max ? `Estimated delivery: ${min} days` : `Estimated delivery: ${min}–${max} days`;
}
