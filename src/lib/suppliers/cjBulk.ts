/** Pure rules for the CJ bulk catalog scan (browser-safe, no secrets). */
import type { PricingRule } from "@/lib/bazaarPricing";
import { landedPrice, profitBreakdown, type ProfitBreakdown } from "./cjImport";

export const BULK_PAGE_SIZE = 100;
/** Options per product that get their own live US shipping quote (each quote is a separate CJ request). */
export const BULK_MAX_OPTIONS = Number.POSITIVE_INFINITY;
export const REJECT_REASONS = ["duplicate", "no_image", "no_options", "out_of_stock", "no_us_shipping", "below_floor", "error"] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];
export const REJECT_LABEL: Record<RejectReason, string> = { duplicate: "Already imported", no_image: "No product photo", no_options: "No priced options", out_of_stock: "Out of stock", no_us_shipping: "No US shipping", below_floor: "Under $2 profit", error: "CJ error" };

export type Cursor = { catIndex: number; page: number; offset: number; variantOffset?: number; done?: boolean };
export type CatCounts = { discovered: number; eligible: number; imported: number; rejected: Partial<Record<RejectReason, number>> };
export type BulkState = { cursor: Cursor; totals: Record<string, CatCounts>; categoriesTotal: number; categories?: { id: string; name: string; parent: string; top: string; topId: string }[] };
export const emptyState = (): BulkState => ({ cursor: { catIndex: 0, page: 1, offset: 0 }, totals: {}, categoriesTotal: 0 });

export function bump(state: BulkState, top: string, k: "discovered" | "eligible" | "imported" | RejectReason) {
  const c = (state.totals[top] ??= { discovered: 0, eligible: 0, imported: 0, rejected: {} });
  if (k === "discovered" || k === "eligible" || k === "imported") c[k]++; else c.rejected[k] = (c.rejected[k] ?? 0) + 1;
}
export function sumCounts(t: Record<string, CatCounts>): CatCounts {
  const s: CatCounts = { discovered: 0, eligible: 0, imported: 0, rejected: {} };
  for (const c of Object.values(t)) { s.discovered += c.discovered; s.eligible += c.eligible; s.imported += c.imported; for (const [k, n] of Object.entries(c.rejected)) s.rejected[k as RejectReason] = (s.rejected[k as RejectReason] ?? 0) + (n ?? 0); }
  return s;
}

/** Distinct persisted product counts supersede stale checkpoints; duplicate retries are not new discoveries. */
export function reconciledCounts(checkpoint: CatCounts, persisted: number): CatCounts {
  const rejected = { ...checkpoint.rejected };
  delete rejected.duplicate;
  const failures = Object.values(rejected).reduce((n, v) => n + (v ?? 0), 0);
  return { discovered: persisted + failures, eligible: persisted, imported: persisted, rejected };
}

/** Move to the next page / category after a page is fully processed. */
export function advance(c: Cursor, pageItems: number, total: number, categories: number): Cursor {
  const more = pageItems >= BULK_PAGE_SIZE && c.page * BULK_PAGE_SIZE < total;
  if (more) return { catIndex: c.catIndex, page: c.page + 1, offset: 0 };
  const next = c.catIndex + 1;
  return next >= categories ? { catIndex: next, page: 1, offset: 0, done: true } : { catIndex: next, page: 1, offset: 0 };
}

const DEPT: [RegExp, string][] = [[/shoe|bag/i, "Footwear"], [/clothing|jewel|watch/i, "Fashion"], [/electronic|phone|computer|office/i, "Electronics"], [/beauty|health|hair/i, "Beauty"], [/improvement/i, "Tools"], [/home|garden|furniture|pet/i, "Home"], [/automobile|motorcycle/i, "Automotive"], [/sport|outdoor/i, "Sports & Outdoors"], [/toy|kid|bab/i, "Toys & Hobbies"]];
export const departmentFor = (top: string): string | null => DEPT.find(([r]) => r.test(top))?.[1] ?? null;

export type OptionIn = { vid: string; costCents: number; stockUS: number; stockOther: number };
/** Preserve all in-stock options; quote the actual warehouse origin. */
export function pickOptions(opts: OptionIn[], max = BULK_MAX_OPTIONS) {
  return opts.filter((o) => o.stockUS + o.stockOther > 0).sort((a, b) => a.costCents - b.costCents).slice(0, max)
    .map((o) => ({ ...o, from: o.stockUS > 0 ? "US" : "CN", stock: o.stockUS > 0 ? o.stockUS : o.stockOther }));
}

export type Priced = { priceCents: number; profitCents: number; marginPercent: number; belowFloor: boolean; breakdown: ProfitBreakdown };
/** Price one option with the store rule; enforces the minimum net profit on the full breakdown. */
export function priceOption(itemCostCents: number, shippingCents: number, rule: PricingRule): Priced {
  const p = landedPrice(itemCostCents, shippingCents, rule);
  const b = profitBreakdown(itemCostCents, shippingCents, rule);
  return { priceCents: p.priceCents, profitCents: b.netProfitCents, marginPercent: b.marginPercent, belowFloor: p.belowFloor || b.netProfitCents < Math.max(200, rule.min_profit_cents), breakdown: b };
}

/** Scan outcomes are mutually exclusive per CJ product, so totals reconcile: discovered = sum of outcomes. */
export const OUTCOMES = ["imported", "duplicate", "skipped", "rejected", "failed"] as const;
export type Outcome = (typeof OUTCOMES)[number];
export function outcomeFor(r: RejectReason | "imported"): Outcome {
  if (r === "imported") return "imported";
  if (r === "duplicate") return "duplicate";
  if (r === "error") return "failed";
  return "rejected";
}
export type OutcomeRow = { category_top: string; outcome: string; reason: string | null };
export type CategoryReport = { discovered: number; imported: number; duplicate: number; skipped: number; rejected: number; failed: number; reasons: Record<string, number> };
export function reportFromOutcomes(rows: OutcomeRow[]): { total: CategoryReport; byCategory: Record<string, CategoryReport> } {
  const blank = (): CategoryReport => ({ discovered: 0, imported: 0, duplicate: 0, skipped: 0, rejected: 0, failed: 0, reasons: {} });
  const total = blank(), byCategory: Record<string, CategoryReport> = {};
  for (const r of rows) {
    const c = (byCategory[r.category_top] ??= blank());
    for (const x of [c, total]) {
      x.discovered++;
      if ((OUTCOMES as readonly string[]).includes(r.outcome)) x[r.outcome as Outcome]++;
      if (r.reason && r.outcome !== "imported") x.reasons[r.reason] = (x.reasons[r.reason] ?? 0) + 1;
    }
  }
  return { total, byCategory };
}
/** Lease length the hosted worker requests; the database rejects anything outside 10–300 seconds. */
export const LEASE_SECONDS = 90;
export const validLeaseSeconds = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 10 && n <= 300;
