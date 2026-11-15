import { describe, expect, it } from "vitest";
import { computeCommission, trustedCommissionRate } from "./marketplaceCommission";
import { calculateFees } from "./stripe.server";

describe("marketplace commission is server-derived", () => {
  it("ignores a buyer-forged 0.1% commission rate", () => {
    expect(trustedCommissionRate(0.001)).toBe(0.05);
  });
  it("ignores a buyer-forged zero commission rate", () => {
    expect(trustedCommissionRate(0)).toBe(0.05);
  });
  it("forged rate cannot inflate seller payout at checkout", () => {
    const honest = calculateFees(10000, { commissionRate: trustedCommissionRate(undefined) });
    const forged = calculateFees(10000, { commissionRate: trustedCommissionRate(0) });
    expect(forged.commissionCents).toBe(500);
    expect(forged.sellerNet).toBe(honest.sellerNet);
  });
  it("normal $100 Buy Now: $5 commission, $95 seller gross", () => {
    expect(computeCommission(10000)).toEqual({ commissionRate: 0.05, commissionCents: 500, sellerGrossCents: 9500 });
  });
});
