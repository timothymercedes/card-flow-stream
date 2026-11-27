/**
 * PullBid Live Marketplace + Live fee policy (pure, client-safe).
 * PB Store and PB Bazaar never use these rules.
 */
export const COMMISSION_TIER_CENTS = 50_000; // $500
export const COMMISSION_BASE_RATE = 0.05;
export const COMMISSION_UPPER_RATE = 0.08;
export const VIP_THRESHOLD_CENTS = 650_000; // $6,500
export const LIVE_BUYER_PAID_TRANSACTIONS = 5;
/** Marketplace fixed-price: flat buyer platform fee once per checkout at/above the merchandise threshold. */
export const MARKETPLACE_BUYER_FEE_CENTS = 123; // $1.23
export const MARKETPLACE_BUYER_FEE_MIN_SUBTOTAL_CENTS = 2_000; // $20.00 (merchandise only)
/** Live: 2% buyer platform fee, capped $5 per transaction, on the buyer's first 5 paid transactions per stream. */
export const LIVE_PLATFORM_FEE_RATE = 0.02;
export const LIVE_PLATFORM_FEE_CAP_CENTS = 500;

/** Commission for one sale given the seller's prior eligible sales this week. */
export function tieredCommissionCents(priorWeekCents: number, saleCents: number): number {
  const prior = Math.max(0, Math.round(priorWeekCents));
  const sale = Math.max(0, Math.round(saleCents));
  const baseRoom = Math.max(0, COMMISSION_TIER_CENTS - prior);
  const basePart = Math.min(sale, baseRoom);
  const upperPart = sale - basePart;
  return Math.round(basePart * COMMISSION_BASE_RATE + upperPart * COMMISSION_UPPER_RATE);
}

/** Standard commission for a whole week's eligible sales. */
export function weeklyStandardCommissionCents(weekCents: number): number {
  return tieredCommissionCents(0, weekCents);
}

/** Retroactive VIP credit: standard commission minus flat 5%. Zero below $6,500. */
export function vipCreditCents(weekCents: number, chargedCommissionCents = weeklyStandardCommissionCents(weekCents)): number {
  if (weekCents < VIP_THRESHOLD_CENTS) return 0;
  return Math.max(0, chargedCommissionCents - Math.round(weekCents * COMMISSION_BASE_RATE));
}

/** Monday 00:00 America/New_York for the week containing `at`, as a UTC Date (DST-aware). */
export function easternWeekStart(at: Date): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
    }).formatToParts(at).map((p) => [p.type, p.value]),
  );
  const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(String(parts.weekday));
  const localMidnight = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) - dow);
  // Find the New York offset at that local midnight (try EST and EDT).
  for (const offsetH of [5, 4]) {
    const candidate = new Date(localMidnight + offsetH * 3_600_000);
    const hm = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(candidate);
    if (hm === "00:00") return candidate;
  }
  return new Date(localMidnight + 5 * 3_600_000);
}

/** Marketplace fixed-price buyer platform fee for one checkout (merchandise subtotal excludes shipping/tax). */
export function marketplaceBuyerPlatformFeeCents(merchandiseSubtotalCents: number): number {
  return Math.round(merchandiseSubtotalCents) >= MARKETPLACE_BUYER_FEE_MIN_SUBTOTAL_CENTS ? MARKETPLACE_BUYER_FEE_CENTS : 0;
}

/** Live buyer platform fee for one paid transaction in a stream: 2% capped $5 for 1–5, $0 from 6. */
export function livePlatformFeeCents(transactionIndex: number, merchandiseSubtotalCents: number): number {
  if (transactionIndex > LIVE_BUYER_PAID_TRANSACTIONS) return 0;
  const sub = Math.max(0, Math.round(merchandiseSubtotalCents));
  return Math.min(LIVE_PLATFORM_FEE_CAP_CENTS, Math.round(sub * LIVE_PLATFORM_FEE_RATE));
}

/** Split one transaction-level fee across its orders by merchandise share; remainder to the first. */
export function apportionCents(totalCents: number, weights: number[]): number[] {
  const sum = weights.reduce((a, w) => a + Math.max(0, w), 0);
  if (sum <= 0 || weights.length === 0) return weights.map((_, i) => (i === 0 ? totalCents : 0));
  const parts = weights.map((w) => Math.floor((totalCents * Math.max(0, w)) / sum));
  parts[0] += totalCents - parts.reduce((a, b) => a + b, 0);
  return parts;
}

/** Live: transactions 1–5 in a stream are buyer-paid processing; 6+ seller absorbs. */
export function liveProcessingMode(transactionIndex: number): "buyer" | "seller_absorbed" {
  return transactionIndex > LIVE_BUYER_PAID_TRANSACTIONS ? "seller_absorbed" : "buyer";
}

/** Next transaction number from prior paid orders; one payment (intent) = one transaction. */
export function nextLiveTransactionIndex(paidOrders: { id: string; stripe_payment_intent_id?: string | null }[]): number {
  return new Set(paidOrders.map((o) => o.stripe_payment_intent_id || `order:${o.id}`)).size + 1;
}
