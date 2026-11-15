import { describe, it, expect } from "vitest";
import { htmlToText, landedPrice, cheapestQuote } from "./cjImport";
import { parseVariantOptions } from "./cjAdapter.server";
const rule = { markup_percent: 40, markup_fixed_cents: 0, min_profit_cents: 200, min_margin_percent: 15, shipping_cost_cents: 0, fee_percent: 2.9, fee_fixed_cents: 30, other_cost_cents: 0, round_to_cents: 1 };
describe("CJ import helpers", () => {
  it("strips scripts and tags", () => { expect(htmlToText('<p>Hi<script>alert(1)</script> <b>there</b></p>')).toBe("Hi there"); });
  it("includes supplier shipping in landed cost and keeps profit above floor", () => {
    const r = landedPrice(1000, 500, rule); expect(r.landedCostCents).toBe(1500); expect(r.profitCents).toBeGreaterThanOrEqual(200); expect(r.belowFloor).toBe(false);
  });
  it("shipping raises the retail price", () => { expect(landedPrice(1000, 500, rule).priceCents).toBeGreaterThan(landedPrice(1000, 0, rule).priceCents); });
  it("picks the cheapest quote", () => { expect(cheapestQuote([{ costCents: 900 }, { costCents: 300 }])?.costCents).toBe(300); expect(cheapestQuote([])).toBeNull(); });
  it("pairs CJ option names with values", () => {
    expect(parseVariantOptions("Color-Size", "Black-XL")).toEqual({ Color: "Black", Size: "XL" });
    expect(parseVariantOptions("Color", "Navy Blue")).toEqual({ Color: "Navy Blue" });
    expect(parseVariantOptions(null, "A-B-C")).toEqual({ Option: "A-B-C" });
  });
});

import { profitBreakdown } from "./cjImport";
describe("profitBreakdown", () => {
  const rule = { markup_percent: 50, markup_fixed_cents: 0, min_profit_cents: 300, min_margin_percent: 15, shipping_cost_cents: 0, fee_percent: 2.9, fee_fixed_cents: 30, other_cost_cents: 50, round_to_cents: 1 };
  it("subtracts every cost from the price", () => {
    const b = profitBreakdown(500, 350, rule);
    expect(b.netProfitCents).toBe(b.priceCents - 500 - 350 - 0 - b.feeCents - 50);
    expect(b.feeCents).toBe(Math.round(b.priceCents * 0.029) + 30);
  });
  it("never prices below the minimum profit", () => {
    const b = profitBreakdown(100, 100, rule);
    expect(b.netProfitCents).toBeGreaterThanOrEqual(299);
    expect(b.belowFloor).toBe(false);
  });
  it("flags an override below the floor", () => {
    expect(profitBreakdown(1000, 500, rule, 1200).belowFloor).toBe(true);
  });
});
