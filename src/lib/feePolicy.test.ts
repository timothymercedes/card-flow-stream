import { describe, expect, it } from "vitest";
import { easternWeekStart, liveProcessingMode, nextLiveTransactionIndex, tieredCommissionCents, vipCreditCents, weeklyStandardCommissionCents } from "./feePolicy";
import { calculateFees } from "./stripe.server";

describe("seller commission policy", () => {
  it("first $700 sale = $41", () => expect(tieredCommissionCents(0, 70_000)).toBe(4_100));
  it("$450 prior + $100 sale = $6.50", () => expect(tieredCommissionCents(45_000, 10_000)).toBe(650));
  it("$2,000 week = $145", () => expect(weeklyStandardCommissionCents(200_000)).toBe(14_500));
  it("$8,000 VIP week credit = $225", () => expect(vipCreditCents(800_000)).toBe(22_500));
  it("no VIP credit below $6,500", () => expect(vipCreditCents(649_999)).toBe(0));
  it("Marketplace + Live combine toward the same threshold", () => {
    const afterMarket = 30_000; // $300 marketplace
    expect(tieredCommissionCents(afterMarket, 30_000)).toBe(1_800); // $200@5% + $100@8% = $18
  });
  it("week resets Monday midnight Eastern (EST and EDT)", () => {
    expect(easternWeekStart(new Date("2026-11-25T16:00:00Z")).toISOString()).toBe("2026-11-23T05:00:00.000Z");
    expect(easternWeekStart(new Date("2026-07-15T12:00:00Z")).toISOString()).toBe("2026-07-13T04:00:00.000Z");
    expect(easternWeekStart(new Date("2026-11-23T04:59:00Z")).toISOString()).toBe("2026-11-16T05:00:00.000Z");
    expect(easternWeekStart(new Date("2026-11-23T05:00:00Z")).toISOString()).toBe("2026-11-23T05:00:00.000Z");
  });
});

describe("buyer processing policy", () => {
  it("Marketplace has no $1.23 platform fee and buyer covers processing", () => {
    const f = calculateFees(10_000);
    expect(f.platformFee).toBe(0);
    expect(f.sellerProcessingFee).toBe(0);
    expect(f.buyerTotal).toBe(Math.ceil((10_000 + 30) / (1 - 0.029)));
  });
  it("Live transactions 1-3 buyer pays, 4+ seller pays", () => {
    expect([1, 2, 3, 4, 5].map(liveProcessingMode)).toEqual(["buyer", "buyer", "buyer", "seller_absorbed", "seller_absorbed"]);
    const fourth = calculateFees(10_000, { platformFeeCentsOverride: 0, feeSplitMode: liveProcessingMode(4) });
    expect(fourth.buyerProcessingFee).toBe(0);
    expect(fourth.platformFee).toBe(0);
  });
  it("multiple items in one payment count once; duplicate webhooks don't add slots", () => {
    expect(nextLiveTransactionIndex([
      { id: "a", stripe_payment_intent_id: "pi_1" }, { id: "b", stripe_payment_intent_id: "pi_1" }, { id: "c", stripe_payment_intent_id: "pi_2" },
    ])).toBe(3);
  });
  it("international fee kept at 4%", () => expect(calculateFees(10_000, { isInternational: true }).intlFee).toBe(400));
});
