/** Listing boost feed rules (pure, shared by Marketplace and tests). Promoted items never exceed the configured feed share. */
export type BoostCandidate = { id: string; seller_id: string; category?: string | null; department?: string | null; boost_id: string; boost_weight: number; boost_ends_at: string };
export type FeedItem<T> = (T & { sponsored?: false }) | (BoostCandidate & { sponsored: true });

/** Regular listings shown between two promoted slots. 10% → 9 regular + 1 promoted per 10 positions. */
export function organicPerSlot(feedPercent: number): number {
  const pct = Math.min(10, Math.max(1, Math.floor(feedPercent)));
  return Math.ceil(100 / pct) - 1;
}

/** Deterministic 0..1 generator so a feed doesn't reshuffle on every render. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1_000_000) / 1_000_000; };
}

export function interleaveBoosts<T extends { id: string; seller_id?: string | null }>(
  organic: T[], boosts: BoostCandidate[], opts: { feedPercent: number; now?: number; seed?: number; interests?: string[] },
): FeedItem<T>[] {
  const now = opts.now ?? Date.now();
  const interests = new Set(opts.interests ?? []);
  const live = boosts.filter((b) => new Date(b.boost_ends_at).getTime() > now);
  // Boosting must never remove a search match from its normal position.
  // Only inject promotions that aren't already present in these results.
  const regular = organic;
  const organicIds = new Set(regular.map((o) => o.id));
  const every = organicPerSlot(opts.feedPercent);
  const rand = rng(opts.seed ?? 1);
  const pool = live.filter((b) => !organicIds.has(b.id));
  const out: FeedItem<T>[] = [];
  let lastSeller: string | null | undefined = null;
  let lastBoostSeller: string | null = null;
  regular.forEach((item, i) => {
    out.push(item as FeedItem<T>);
    lastSeller = item.seller_id;
    if ((i + 1) % every !== 0 || pool.length === 0) return;
    const ok = pool.filter((b) => b.seller_id !== lastSeller && b.seller_id !== lastBoostSeller && b.seller_id !== regular[i + 1]?.seller_id);
    if (!ok.length) return;
    const w = ok.map((b) => Math.max(1, b.boost_weight) * (interests.has(b.category ?? "") || interests.has(b.department ?? "") ? 2 : 1));
    let r = rand() * w.reduce((a, b) => a + b, 0);
    let pick = ok[ok.length - 1];
    for (let k = 0; k < ok.length; k++) { r -= w[k]; if (r <= 0) { pick = ok[k]; break; } }
    pool.splice(pool.indexOf(pick), 1);
    out.push({ ...pick, sponsored: true });
    lastBoostSeller = pick.seller_id;
    lastSeller = pick.seller_id;
  });
  return out;
}

export function boostErrorMessage(raw: string): string {
  if (raw.includes("BOOST_ALREADY_ACTIVE")) return "This listing already has an active boost.";
  if (raw.includes("BOOST_SELLER_LIMIT")) return "You already have the maximum number of paid boosts running.";
  if (raw.includes("BOOST_FREE_USED")) return "You've used your free boost this week.";
  if (raw.includes("BOOST_LISTING_NOT_ELIGIBLE")) return "Only your active public listings can be boosted.";
  if (raw.includes("BOOST_INVALID")) return "That boost option isn't available.";
  return "Couldn't start the boost. Please try again.";
}
