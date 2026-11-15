import { describe, it, expect } from "vitest";
import { advance, pickOptions, priceOption, bump, emptyState, sumCounts, departmentFor, reconciledCounts } from "./cjBulk";
const rule = { markup_percent: 30, markup_fixed_cents: 0, min_profit_cents: 200, min_margin_percent: 0, fee_percent: 2.9, fee_fixed_cents: 30, shipping_cost_cents: 0, other_cost_cents: 0, round_to_cents: 1 } as never;

describe("CJ bulk scan rules", () => {
  it("preserves every stocked variant rather than the cheapest three", () => {
    expect(pickOptions(Array.from({ length: 45 }, (_, i) => ({ vid: String(i), costCents: 100 + i, stockUS: 1, stockOther: 0 })))).toHaveLength(45);
  });
  it("reconciles committed imports without counting duplicate retries as discoveries", () => {
    expect(reconciledCounts({ discovered: 12, eligible: 8, imported: 8, rejected: { duplicate: 2, no_us_shipping: 2 } }, 9)).toEqual({ discovered: 11, eligible: 9, imported: 9, rejected: { no_us_shipping: 2 } });
  });
  it("every imported option clears the $2 minimum net profit", () => {
    for (const cost of [10, 66, 250, 999, 4200]) { const p = priceOption(cost, 485, rule); if (!p.belowFloor) expect(p.breakdown.netProfitCents).toBeGreaterThanOrEqual(200); }
  });
  it("flags an option whose net profit is under $2", () => {
    const p = priceOption(500, 300, { ...(rule as object), min_profit_cents: 0, markup_percent: 0 } as never);
    expect(p.belowFloor).toBe(true);
  });
  it("skips out-of-stock options and ships from the US warehouse when it has stock", () => {
    const r = pickOptions([{ vid: "a", costCents: 100, stockUS: 0, stockOther: 0 }, { vid: "b", costCents: 300, stockUS: 5, stockOther: 9 }, { vid: "c", costCents: 200, stockUS: 0, stockOther: 4 }]);
    expect(r.map((x) => x.vid)).toEqual(["c", "b"]);
    expect(r[1]).toMatchObject({ from: "US", stock: 5 });
    expect(r[0]).toMatchObject({ from: "CN", stock: 4 });
  });
  it("has no fixed product limit: walks every page then every category", () => {
    expect(advance({ catIndex: 0, page: 1, offset: 100 }, 100, 1027, 578)).toEqual({ catIndex: 0, page: 2, offset: 0 });
    expect(advance({ catIndex: 0, page: 11, offset: 27 }, 27, 1027, 578)).toEqual({ catIndex: 1, page: 1, offset: 0 });
    expect(advance({ catIndex: 577, page: 1, offset: 3 }, 3, 3, 578).done).toBe(true);
  });
  it("counts per category", () => {
    const s = emptyState(); bump(s, "Pet Supplies", "discovered"); bump(s, "Pet Supplies", "below_floor"); bump(s, "Toys", "imported");
    expect(sumCounts(s.totals)).toMatchObject({ discovered: 1, imported: 1, rejected: { below_floor: 1 } });
    expect(departmentFor("Bags & Shoes")).toBe("Footwear");
  });
});

import { outcomeFor, reportFromOutcomes, validLeaseSeconds } from "./cjBulk";
describe("hosted scan reporting", () => {
  it("maps every result to exactly one outcome", () => {
    expect(outcomeFor("imported")).toBe("imported");
    expect(outcomeFor("duplicate")).toBe("duplicate");
    expect(outcomeFor("error")).toBe("failed");
    expect(outcomeFor("below_floor")).toBe("rejected");
  });
  it("discovered equals the sum of distinct outcomes, with reasons per category", () => {
    const r = reportFromOutcomes([
      { category_top: "Home", outcome: "imported", reason: null },
      { category_top: "Home", outcome: "rejected", reason: "below_floor" },
      { category_top: "Toys", outcome: "failed", reason: "error" },
      { category_top: "Toys", outcome: "duplicate", reason: "duplicate" },
    ]);
    const t = r.total;
    expect(t.discovered).toBe(t.imported + t.duplicate + t.skipped + t.rejected + t.failed);
    expect(r.byCategory.Home.reasons).toEqual({ below_floor: 1 });
  });
  it("rejects invalid lease durations", () => {
    for (const n of [null, 0, -5, 9, 301, 1.5]) expect(validLeaseSeconds(n)).toBe(false);
    expect(validLeaseSeconds(90)).toBe(true);
  });
});
