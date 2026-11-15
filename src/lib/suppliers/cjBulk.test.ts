import { describe, it, expect } from "vitest";
import { advance, pickOptions, priceOption, bump, emptyState, sumCounts, departmentFor } from "./cjBulk";
const rule = { markup_percent: 30, min_profit_cents: 200, fee_percent: 2.9, fee_fixed_cents: 30, shipping_cost_cents: 0, other_cost_cents: 0, rounding: "none" } as never;

describe("CJ bulk scan rules", () => {
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
