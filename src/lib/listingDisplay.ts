export type ListingLike = {
  is_auction?: boolean | null;
  listing_type?: string | null;
  current_bid?: number | string | null;
  starting_bid?: number | string | null;
  price?: number | string | null;
  buy_now_price?: number | string | null;
  accepts_offers?: boolean | null;
};

export type ListingPriceDisplay = {
  label: string;
  suffix?: string;
  kind: "price" | "offer" | "empty";
  amount: number;
};

export function getListingPriceDisplay(listing: ListingLike, compact = false): ListingPriceDisplay {
  const isAuction = !!listing.is_auction || listing.listing_type === "auction";
  const amount = isAuction
    ? Number(listing.current_bid ?? listing.starting_bid ?? 0)
    : Number(listing.price ?? listing.buy_now_price ?? 0);

  if (amount > 0) {
    const decimals = compact && amount >= 100 ? 0 : 2;
    return {
      label: `$${amount.toFixed(decimals)}`,
      suffix: isAuction ? "bid" : undefined,
      kind: "price",
      amount,
    };
  }

  if (!!listing.accepts_offers || listing.listing_type === "offer") {
    return { label: "Make Offer", kind: "offer", amount: 0 };
  }

  return { label: "—", kind: "empty", amount: 0 };
}

export function isPublicListingVisible(listing: ListingLike) {
  return getListingPriceDisplay(listing).kind !== "empty";
}