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

import { parseVariantOptions, dollarsToCents } from "./bazaar";
describe("bazaar product inputs", () => {
  it("parses option labels", () => {
    expect(parseVariantOptions("Size: M, Color: Black")).toEqual({ Size: "M", Color: "Black" });
    expect(parseVariantOptions("Large")).toEqual({ Option: "Large" });
  });
  it("converts prices to cents", () => {
    expect(dollarsToCents("38")).toBe(3800);
    expect(dollarsToCents("$19.99")).toBe(1999);
    expect(dollarsToCents("-5")).toBeNull();
    expect(dollarsToCents("1.999")).toBeNull();
  });
});
