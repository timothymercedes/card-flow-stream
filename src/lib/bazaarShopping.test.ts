import { describe, expect, it } from "vitest";
import { addCartItem, buyable, checkCart, groupCart, parseCart, type ShoppingProduct, type CartItem } from "./bazaarShopping";
const p = "11111111-1111-4111-8111-111111111111";
const v = "22222222-2222-4222-8222-222222222222";
const product: ShoppingProduct = { id: p, title: "Fixture", description: null, department: null, brand: null, model: null, condition: "new", specifications: {}, images: [], bazaar_stores: { id: "store-a", slug: "store-a", name: "A", store_type: "independent", verification_status: "verified", logo_url: null, shipping_policy: "Ships separately", return_policy: null, processing_days: 2 }, bazaar_product_variants: [{ id: v, sku: "RED-M", options: { Size: "M", Color: "Red" }, price_cents: 2400, compare_at_cents: 3000, quantity: 3, is_active: true }] };
const item: CartItem = { productId: p, variantId: v, quantity: 2, seenPrice: 2400 };
describe("Bazaar shopping safeguards", () => {
  it("preserves variant and quantity across saved browser sessions", () => { expect(parseCart(JSON.stringify([item]))).toEqual([item]); });
  it("blocks sold-out variants", () => { expect(buyable({ ...product.bazaar_product_variants[0], quantity: 0 })).toBe(false); expect(() => addCartItem([], { ...product, bazaar_product_variants: [{ ...product.bazaar_product_variants[0], quantity: 0 }] }, v, 1)).toThrow("unavailable"); });
  it("blocks inactive variants", () => { expect(() => addCartItem([], { ...product, bazaar_product_variants: [{ ...product.bazaar_product_variants[0], is_active: false }] }, v, 1)).toThrow("unavailable"); });
  it("includes existing cart quantities in stock limits", () => { expect(() => addCartItem([item], product, v, 2)).toThrow("Only 3"); expect(addCartItem([item], product, v, 1)[0].quantity).toBe(3); });
  it("flags changed price without accepting it silently", () => { expect(checkCart([{ ...item, seenPrice: 2000 }], [product])[0].issue).toBe("price"); });
  it("flags reduced inventory", () => { expect(checkCart([{ ...item, quantity: 4 }], [product])[0].issue).toBe("stock"); });
  it("blocks removed, private or suspended products excluded by public reads", () => { expect(checkCart([item], [])[0].issue).toBe("unavailable"); });
  it("groups two stores without merging fulfillment responsibilities", () => { const second = { ...product, id: "second", bazaar_stores: { ...product.bazaar_stores, id: "store-b" } }; expect(groupCart(checkCart([item, { ...item, productId: "second" }], [product, second])).map((g) => g.store?.id)).toEqual(["store-a", "store-b"]); });
  it("rejects corrupt and duplicate saved quantities", () => { expect(parseCart(JSON.stringify([{ ...item, quantity: -1 }, item, item]))).toEqual([item]); expect(parseCart("broken")).toEqual([]); });
});