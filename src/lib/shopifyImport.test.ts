import { describe, it, expect } from "vitest";
import { markupCents, variantOptions } from "./shopifyImport";
describe("shopify import", () => {
  it("applies 20% markup to a $10 Shopify price -> $12", () => { expect(markupCents("10.00", 20)).toBe(1200); });
  it("0% markup keeps the Shopify price", () => { expect(markupCents("19.99", 0)).toBe(1999); });
  it("drops Shopify's Default Title option", () => {
    const p: any = { options: [{ name: "Title" }] };
    expect(variantOptions(p, { id: 1, title: "", price: "1", sku: null, option1: "Default Title" })).toEqual({});
  });
});
