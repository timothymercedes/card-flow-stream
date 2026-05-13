import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
    _stripe = new Stripe(key, { apiVersion: "2024-12-18.acacia" as any });
  }
  return _stripe;
}

// Fixed buyer platform fee added on top of marketplace purchases.
// Helps offset Stripe processing fees (2.9% + $0.30) for sellers.
export const BUYER_PLATFORM_FEE_CENTS = 123; // $1.23

// Tip platform fee — platform takes 10% of tip amount before payout.
export const TIP_PLATFORM_FEE_RATE = 0.10;

// Legacy export kept for any code still importing it. Buyer marketplace
// purchases now use a fixed fee instead of these percentages.
export const PLATFORM_FEE_RATE = 0.05;
export const BUYER_SERVICE_FEE_RATE = 0.0145;
export const BUYER_SERVICE_FEE_FIXED_CENTS = 15;

/**
 * Marketplace purchase fees.
 *  - Buyer pays: subtotal + $1.23 fixed platform fee.
 *  - Platform takes the $1.23 as the application fee on the Connect transfer.
 *  - Returns `buyerServiceFee` (alias of platformFee) for backwards compat
 *    with existing UI rendering.
 */
export function calculateFees(subtotalCents: number) {
  const platformFee = BUYER_PLATFORM_FEE_CENTS;
  const buyerTotal = subtotalCents + platformFee;
  return {
    subtotalCents,
    platformFee,
    buyerServiceFee: platformFee, // legacy alias
    buyerTotal,
  };
}

/**
 * Tip / shoutout fees.
 *  - Buyer pays the exact tip amount (no extra service fee on top).
 *  - Platform takes 10% as application fee.
 *  - Streamer payout = tip - 10%.
 */
export function calculateTipFees(tipCents: number) {
  const platformFee = Math.round(tipCents * TIP_PLATFORM_FEE_RATE);
  const streamerPayout = tipCents - platformFee;
  return {
    subtotalCents: tipCents,
    platformFee,
    streamerPayout,
    buyerServiceFee: 0,
    buyerTotal: tipCents,
  };
}

/**
 * Promotion duration mapping. Promotion payments go directly to the platform
 * (no Connect transfer), and buy time on the discoverability boost.
 *
 *   $1  -> 5 minutes
 *   $5  -> 15 minutes
 *   $10 -> 25 minutes
 *   custom amounts scale piecewise-linearly between/above the anchors.
 */
export function promotionDurationSeconds(amountCents: number): number {
  const dollars = amountCents / 100;
  let minutes: number;
  if (dollars <= 1) minutes = 5;
  else if (dollars <= 5) minutes = 5 + (dollars - 1) * 2.5;          // $1→5, $5→15
  else if (dollars <= 10) minutes = 15 + (dollars - 5) * 2;          // $5→15, $10→25
  else minutes = 25 + (dollars - 10) * 2;                            // linear above
  return Math.max(60, Math.round(minutes * 60));
}
