import { describe, it, expect } from "vitest";
import { slugifyStoreName, isValidStoreSlug, lowestPriceCents } from "./bazaar";

describe("bazaar helpers", () => {
  it("builds public store slugs", () => {
    expect(slugifyStoreName("Apex Apparel Co.")).toBe("apex-apparel-co");
    expect(isValidStoreSlug("apex-apparel-co")).toBe(true);
    expect(isValidStoreSlug("a")).toBe(false);
    expect(isValidStoreSlug("-bad")).toBe(false);
  });
  it("prices from the lowest active variant", () => {
    expect(lowestPriceCents([{ price_cents: 4200 }, { price_cents: 3800 }, { price_cents: 100, is_active: false }])).toBe(3800);
    expect(lowestPriceCents([])).toBeNull();
  });
});
