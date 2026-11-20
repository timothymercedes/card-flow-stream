import { describe, expect, it } from "vitest";
import { marketplaceMethods } from "./marketplaceMethods";

const all = { channel: "marketplace", price: 50, buy_now_price: 50, is_auction: true, accepts_offers: true, accepts_trades: true, vault_card_id: "card", auction_status: "active", auction_ends_at: "2026-11-23T00:00:00Z" };
const now = Date.parse("2026-11-20T00:00:00Z");
describe("independent Marketplace methods", () => {
  for (let mask = 1; mask < 16; mask++) {
    it(`supports selling-option combination ${mask}`, () => {
      const buy = !!(mask & 1), auction = !!(mask & 2), offer = !!(mask & 4), trade = !!(mask & 8);
      const state = marketplaceMethods({ ...all, price: buy ? 50 : null, buy_now_price: buy ? 50 : null, is_auction: auction, accepts_offers: offer, accepts_trades: trade }, 0, now);
      expect([state.buyOpen, state.bidOpen, state.offerOpen, state.tradeOpen]).toEqual([buy, auction, offer, trade]);
    });
  }
  it("ends Buy Now at the first bid", () => expect(marketplaceMethods(all, 1, now).buyOpen).toBe(false));
  it("does not reopen Buy Now after a bid when the auction expires", () => expect(marketplaceMethods(all, 1, Date.parse("2026-11-24T00:00:00Z")).buyOpen).toBe(false));
  it("uses the authoritative top bidder even when bid history is unavailable", () => expect(marketplaceMethods({ ...all, top_bidder_id: "buyer" }, 0, now).buyOpen).toBe(false));
  it("closes every method after a trade", () => {
    const state = marketplaceMethods({ ...all, closed_at: "2026-11-20T00:00:00Z", auction_status: "sold_early" }, 1, now);
    expect([state.buyOpen, state.bidOpen, state.offerOpen, state.tradeOpen]).toEqual([false, false, false, false]);
  });
  it("does not offer trades without a linked Vault item", () => expect(marketplaceMethods({ ...all, vault_card_id: null }, 0, now).tradeOpen).toBe(false));
  it("does not expose offers when only Buy Now is enabled", () => expect(marketplaceMethods({ ...all, accepts_offers: false }, 0, now).offerOpen).toBe(false));
  it("does not add trades or offers to retail", () => {
    for (const channel of ["pb_store", "bazaar"]) {
      const state = marketplaceMethods({ ...all, channel }, 0, now);
      expect([state.offerOpen, state.tradeOpen]).toEqual([false, false]);
    }
  });
});