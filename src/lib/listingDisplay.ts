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
  kind: "price" | "offer" | "trade" | "empty";
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

  if (listing.listing_type === "trade") {
    return { label: "Trade", kind: "trade", amount: 0 };
  }

  return { label: "—", kind: "empty", amount: 0 };
}

export function isPublicListingVisible(listing: ListingLike) {
  return getListingPriceDisplay(listing).kind !== "empty";
}

/**
 * Validate an image URL is acceptable as a marketplace sale photo.
 * Rejects empty, data: URIs (upload still in progress / not persisted),
 * AI/visualization markers, and non-http(s) URLs.
 * Returns null when valid, otherwise a user-friendly error string.
 */
export function validateListingImage(url: string | null | undefined, opts?: { field?: string }): string | null {
  const field = opts?.field || "Photo";
  const v = (url || "").trim();
  if (!v) return `${field} is required — please upload a real photo of the card.`;
  if (v.startsWith("data:")) {
    return `${field} upload didn't finish. Wait for the upload to complete, then try again.`;
  }
  if (!/^https?:\/\//i.test(v)) {
    return `${field} URL is invalid. Please upload an image instead of pasting text.`;
  }
  if (/\/ai-generated\/|placeholder|\/visualization\//i.test(v)) {
    return `${field} can't be an AI/vault image. Please upload a real photo of the card you're selling.`;
  }
  return null;
}