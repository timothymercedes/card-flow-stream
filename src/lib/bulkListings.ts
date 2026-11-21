import { validateListingPhotos } from "@/lib/listingPhotos";

export type BulkItem = {
  vaultId: string; title: string; photos: string[]; price: string; condition: "NM" | "LP" | "MP" | "Damaged";
  quantity: string; sell: boolean; offers: boolean; trade: boolean; tradeEligible: boolean; category: string;
};

/** Returns a per-item error message, or null when the item can be published. */
export function validateBulkItem(it: BulkItem): string | null {
  if (!it.title.trim()) return "Add a title";
  if (!it.sell && !it.trade) return "Choose sale and/or trade";
  if (it.trade && !it.tradeEligible) return "This Vault item isn't public and trade-enabled";
  if (it.sell && !(Number(it.price) > 0)) return "Set a price above $0";
  const q = Number(it.quantity);
  if (!Number.isInteger(q) || q < 1 || q > 999) return "Quantity must be 1–999";
  return validateListingPhotos(it.photos);
}

/** One separate listing row per item — items are never merged. */
export function bulkItemToListing(it: BulkItem, sellerId: string) {
  const price = it.sell ? Number(it.price) : null;
  return {
    seller_id: sellerId, channel: "marketplace", department: "collectibles",
    title: it.title.trim(), description: it.title.trim(), category: it.category, condition: it.condition,
    image_url: it.photos[0]!, back_image_url: it.photos[1] ?? null,
    product_details: { photos: it.photos },
    listing_type: it.sell ? "buy_now" : "offer", is_auction: false,
    accepts_offers: it.offers, accepts_trades: it.trade, vault_card_id: it.vaultId,
    price, buy_now_price: price, quantity: Number(it.quantity), shipping_price: 0, shipping_preset: "bubble", weight_oz: 4,
  };
}
