import { describe, expect, it } from "vitest";
import { computePrice, floorPrice, availabilityLabel, deliveryWindow, type PricingRule } from "./bazaarPricing";

const base: PricingRule = { markup_percent: 0, markup_fixed_cents: 0, min_profit_cents: 0, min_margin_percent: 0, shipping_cost_cents: 0, fee_percent: 0, fee_fixed_cents: 0, other_cost_cents: 0, round_to_cents: 1 };

describe("supplier pricing", () => {
  it("applies percentage markup", () => expect(computePrice(1000, { ...base, markup_percent: 40 }).priceCents).toBe(1400));
  it("applies fixed markup", () => expect(computePrice(1000, { ...base, markup_fixed_cents: 250 }).priceCents).toBe(1250));
  it("combines percentage and fixed markup", () => expect(computePrice(1000, { ...base, markup_percent: 10, markup_fixed_cents: 100 }).priceCents).toBe(1200));
  it("raises price to meet minimum profit after shipping and fees", () => {
    const r = { ...base, markup_percent: 5, min_profit_cents: 300, shipping_cost_cents: 200, fee_percent: 3, fee_fixed_cents: 30 };
    const res = computePrice(1000, r);
    expect(res.profitCents).toBeGreaterThanOrEqual(300);
    expect(res.belowFloor).toBe(false);
    expect(res.priceCents).toBe(floorPrice(1000, r));
  });
  it("enforces minimum margin percent", () => {
    const res = computePrice(1000, { ...base, min_margin_percent: 20 });
    expect(res.priceCents).toBe(1250);
    expect(res.marginPercent).toBe(20);
  });
  it("uses admin override and flags it when below the floor", () => {
    const res = computePrice(1000, { ...base, min_profit_cents: 500 }, 1200);
    expect(res.priceCents).toBe(1200);
    expect(res.belowFloor).toBe(true);
  });
  it("recalculates when supplier cost changes", () => {
    const r = { ...base, markup_percent: 50 };
    expect(computePrice(1000, r).priceCents).toBe(1500);
    expect(computePrice(1400, r).priceCents).toBe(2100);
  });
  it("rounds up to the configured step", () => expect(computePrice(1001, { ...base, round_to_cents: 100 }).priceCents).toBe(1100));
});

describe("availability and delivery", () => {
  it("labels sold out", () => expect(availabilityLabel("sold_out")).toBe("SOLD OUT"));
  it("labels stale/unverified as unavailable to buy", () => expect(availabilityLabel("unverified")).toBe("Temporarily unavailable"));
  it("formats delivery windows", () => expect(deliveryWindow(7, 14)).toBe("Estimated delivery: 7–14 days"));
});
