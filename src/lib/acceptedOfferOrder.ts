/** Pure rules for turning an accepted Marketplace listing offer into an unpaid order. */
export type AcceptedOfferCheck = {
  offer: { buyer_id: string; status: string; amount: number | string; listing_id: string } | null;
  listing: { id: string; seller_id: string; channel: string | null; closed_by: string | null; closed_winner_id: string | null; shipping_price: number | string | null } | null;
  callerId: string;
};

export function validateAcceptedOffer(c: AcceptedOfferCheck): { ok: true; amount: number; shipping: number } | { ok: false; reason: string } {
  if (!c.offer || !c.listing) return { ok: false, reason: "Offer not found" };
  if (c.offer.buyer_id !== c.callerId) return { ok: false, reason: "Only the buyer can pay for this offer" };
  if (c.offer.status !== "accepted") return { ok: false, reason: "This offer has not been accepted" };
  if ((c.listing.channel ?? "marketplace") !== "marketplace") return { ok: false, reason: "Offers are only available on Marketplace listings" };
  if (c.listing.closed_by !== "offer" || c.listing.closed_winner_id !== c.callerId) return { ok: false, reason: "This listing was not sold to you by offer" };
  const amount = Math.round(Number(c.offer.amount) * 100) / 100;
  if (!(amount >= 0.5)) return { ok: false, reason: "Offer amount is too low to pay" };
  const shipping = Math.max(0, Math.round(Number(c.listing.shipping_price || 0) * 100) / 100);
  return { ok: true, amount, shipping };
}
