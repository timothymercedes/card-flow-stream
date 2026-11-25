import { describe, it, expect } from "vitest";
import { validateAcceptedOffer } from "./acceptedOfferOrder";
const base = {
  offer: { buyer_id: "b", status: "accepted", amount: "40", listing_id: "l" },
  listing: { id: "l", seller_id: "s", channel: "marketplace", closed_by: "offer", closed_winner_id: "b", shipping_price: 5 },
  callerId: "b",
};
describe("accepted offer order", () => {
  it("charges the offer price plus listing shipping", () => expect(validateAcceptedOffer(base)).toEqual({ ok: true, amount: 40, shipping: 5 }));
  it("refuses other users", () => expect(validateAcceptedOffer({ ...base, callerId: "x" }).ok).toBe(false));
  it("refuses unaccepted offers", () => expect(validateAcceptedOffer({ ...base, offer: { ...base.offer, status: "pending" } }).ok).toBe(false));
  it("excludes PB Store and Bazaar", () => {
    expect(validateAcceptedOffer({ ...base, listing: { ...base.listing, channel: "pb_store" } }).ok).toBe(false);
    expect(validateAcceptedOffer({ ...base, listing: { ...base.listing, channel: "bazaar" } }).ok).toBe(false);
  });
});
