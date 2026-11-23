import type { ListingLike } from "./listingDisplay";

export type MixedListing = ListingLike & {
  channel?: string | null;
  accepts_trades?: boolean | null;
  vault_card_id?: string | null;
  closed_at?: string | null;
  auction_status?: string | null;
  auction_ends_at?: string | null;
  top_bidder_id?: string | null;
  quantity?: number | null;
  sold_count?: number | null;
};

export function marketplaceMethods(listing: MixedListing, bidCount = 0, now = Date.now()) {
  const market = !listing.channel || listing.channel === "marketplace";
  const auction = !!listing.is_auction || listing.listing_type === "auction";
  const buyPrice = Number(listing.buy_now_price) > 0 ? Number(listing.buy_now_price) : Number(listing.price ?? 0);
  const trades = !!listing.accepts_trades || listing.listing_type === "trade";
  const closed = !!listing.closed_at || Number(listing.sold_count ?? 0) >= Number(listing.quantity ?? 1);
  const hasBids = bidCount > 0 || !!listing.top_bidder_id;
  const ended = auction && !!listing.auction_ends_at && new Date(listing.auction_ends_at).getTime() <= now;
  const bidOpen = auction && !closed && !ended && (!listing.auction_status || listing.auction_status === "active");
  return {
    market, auction, buyPrice, closed, hasBids, ended, bidOpen,
    buyOpen: buyPrice > 0 && !closed && !(auction && hasBids),
    offerOpen: market && !!listing.accepts_offers && !closed,
    tradeOpen: market && trades && !!listing.vault_card_id && !closed,
    labels: [buyPrice > 0 && "Buy Now", auction && "Auction", market && listing.accepts_offers && "Make Offer", market && trades && "Trade"].filter((value): value is string => typeof value === "string"),
  };
}