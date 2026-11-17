import { describe, it, expect } from "vitest";
import { shopifyPriceCents, shopifyContributionCents, shopifyVariantIdFromSku } from "./shopifyPricing";

describe("shopify $3 floor pricing", () => {
  it("raises a $1.00 item so it keeps at least $3 after card fees", () => {
    const p = shopifyPriceCents(100);
    expect(p).toBe(441);
    expect(shopifyContributionCents(p, 100)).toBeGreaterThanOrEqual(300);
    expect(shopifyContributionCents(p - 1, 100)).toBeLessThan(300);
  });
  it("keeps the plain 15% markup when it already clears $3", () => {
    expect(shopifyPriceCents(4900)).toBe(5635);
  });
  it("reads the Shopify variant id from the stored sku", () => {
    expect(shopifyVariantIdFromSku("SPA003#53635943137591")).toBe("53635943137591");
    expect(shopifyVariantIdFromSku("nope")).toBeNull();
  });
});
