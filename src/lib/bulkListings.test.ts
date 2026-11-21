import { describe, it, expect } from "vitest";
import { validateBulkItem, bulkItemToListing, type BulkItem } from "./bulkListings";
const ph = ["https://a.co/1.jpg", "https://a.co/2.jpg"];
const base: BulkItem = { vaultId: "v1", title: "Charizard", photos: ph, price: "10", condition: "NM", quantity: "1", sell: true, offers: false, trade: false, tradeEligible: false, category: "pokemon" };
describe("bulk listings", () => {
  it("each item needs 2 photos", () => expect(validateBulkItem({ ...base, photos: [ph[0]!] })).toMatch(/at least 2/));
  it("sale needs price > 0", () => expect(validateBulkItem({ ...base, price: "0" })).toMatch(/price/));
  it("trade requires eligible vault item", () => expect(validateBulkItem({ ...base, sell: false, trade: true })).toMatch(/trade-enabled/));
  it("valid item maps to its own listing with its own photos and quantity", () => {
    expect(validateBulkItem({ ...base, quantity: "3" })).toBeNull();
    const row = bulkItemToListing({ ...base, quantity: "3" }, "s1");
    expect(row.quantity).toBe(3); expect(row.vault_card_id).toBe("v1"); expect(row.product_details.photos).toEqual(ph); expect(row.price).toBe(10);
  });
});
