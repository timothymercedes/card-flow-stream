import { describe, expect, it } from "vitest";
import { previewShopifyContribution } from "./shopifyContribution";

describe("Shopify contribution preview only", () => {
  it("keeps 15% markup when it already clears $2", () => {
    expect(previewShopifyContribution(2500, 2.9, 30).proposedPriceCents).toBe(2875);
  });
  it("raises a $1 cost to the minimum price clearing $2 after configured fees", () => {
    const p = previewShopifyContribution(100, 2.9, 30);
    expect(p.proposedPriceCents).toBe(340);
    expect(p.contributionCents).toBeGreaterThanOrEqual(200);
    expect(339 * 0.971 - 100 - 30).toBeLessThan(200);
  });
  it("rounds upward to the nearest cent", () => {
    expect(previewShopifyContribution(99, 2.9, 30).proposedPriceCents).toBe(339);
  });
  it("uses supplied fees rather than assuming 2.9% plus 30 cents", () => {
    expect(previewShopifyContribution(100, 5, 50).proposedPriceCents).toBe(369);
    expect(368 * 0.95 - 100 - 50).toBeLessThan(200);
  });
});