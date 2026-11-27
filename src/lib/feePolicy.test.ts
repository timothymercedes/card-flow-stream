import { describe, expect, it } from "vitest";
import { apportionCents, easternWeekStart, livePlatformFeeCents, liveProcessingMode, marketplaceBuyerPlatformFeeCents, nextLiveTransactionIndex, tieredCommissionCents, vipCreditCents, weeklyStandardCommissionCents } from "./feePolicy";
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
  it("Marketplace $1.23 fee only when merchandise subtotal is $20.00 or more", () => {
    expect(marketplaceBuyerPlatformFeeCents(1_999)).toBe(0);
    expect(marketplaceBuyerPlatformFeeCents(2_000)).toBe(123);
    expect(marketplaceBuyerPlatformFeeCents(50_000)).toBe(123); // flat, once per checkout
  });
  it("Marketplace fee is buyer-paid, not taken from the seller; buyer covers processing", () => {
    const f = calculateFees(10_000, { platformFeeCentsOverride: marketplaceBuyerPlatformFeeCents(10_000), sellerAbsorbedFeeCentsOverride: 0, commissionCentsOverride: 500 });
    expect(f.platformFee).toBe(123);
    expect(f.sellerProcessingFee).toBe(0);
    expect(f.sellerNet).toBe(9_500);
    expect(f.buyerTotal).toBe(Math.ceil((10_123 + 30) / (1 - 0.029)));
  });
  it("Live 2% platform fee capped at $5 on transactions 1-5, $0 from 6", () => {
    expect(livePlatformFeeCents(1, 10_000)).toBe(200);
    expect(livePlatformFeeCents(5, 100_000)).toBe(500);
    expect(livePlatformFeeCents(6, 10_000)).toBe(0);
  });
  it("Live processing: buyer pays 1-5, seller absorbs from 6", () => {
    expect([1, 5, 6, 7].map(liveProcessingMode)).toEqual(["buyer", "buyer", "seller_absorbed", "seller_absorbed"]);
    const sixth = calculateFees(10_000, { platformFeeCentsOverride: livePlatformFeeCents(6, 10_000), feeSplitMode: liveProcessingMode(6), commissionCentsOverride: 0 });
    expect(sixth.buyerProcessingFee).toBe(0);
    expect(sixth.platformFee).toBe(0);
    expect(sixth.sellerNet).toBe(10_000 - sixth.sellerProcessingFee);
  });
  it("one live transaction's fee splits across its orders without losing cents", () => {
    expect(apportionCents(500, [10_000, 15_000, 5_000])).toEqual([167, 250, 83]);
  });
  it("multiple items in one payment count once; duplicate webhooks don't add slots", () => {
    expect(nextLiveTransactionIndex([
      { id: "a", stripe_payment_intent_id: "pi_1" }, { id: "b", stripe_payment_intent_id: "pi_1" }, { id: "c", stripe_payment_intent_id: "pi_2" },
    ])).toBe(3);
  });
  it("international fee kept at 4%", () => expect(calculateFees(10_000, { isInternational: true }).intlFee).toBe(400));
});
