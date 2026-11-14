// Official PullBid Live fulfillment rules. Pure helpers shared by
// product save, cart and server checkout validation.
export type Channel = "marketplace" | "pb_store" | "bazaar";
export type FulfillmentType = "shipping" | "pickup" | "both";
export type FulfillmentMethod = "shipping" | "pickup";

export interface PickupSeller { verified: boolean; goodStanding: boolean }

export function allowedMethods(channel: Channel, listingType: FulfillmentType = "shipping"): FulfillmentMethod[] {
  if (channel !== "marketplace") return ["shipping"];
  if (listingType === "pickup") return ["pickup"];
  if (listingType === "both") return ["shipping", "pickup"];
  return ["shipping"];
}

export function validateListingFulfillment(channel: Channel, type: FulfillmentType, seller?: PickupSeller, pickupArea?: string | null): string | null {
  if (type === "shipping") return null;
  if (channel === "pb_store") return "PB Store ships only. Local pickup isn't available.";
  if (channel === "bazaar") return "PB Bazaar uses partner shipping only.";
  if (!seller?.verified || !seller.goodStanding) return "Only verified sellers in good standing can offer local pickup.";
  const area = (pickupArea ?? "").trim();
  if (!area) return "Add a pickup area (city or ZIP code).";
  if (/\d+\s+\w+\s+(st|street|ave|avenue|rd|road|blvd|dr|drive|ln|lane|way|ct)\b/i.test(area)) return "Use a city or ZIP code, not a street address.";
  return null;
}

export function validateCheckoutMethod(channel: Channel, listingType: FulfillmentType, method: FulfillmentMethod): string | null {
  return allowedMethods(channel, listingType).includes(method) ? null : `${method === "pickup" ? "Local pickup" : "Shipping"} isn't available for this item.`;
}

export function isValidHandoffCode(code: string): boolean { return /^\d{6}$/.test(code); }
