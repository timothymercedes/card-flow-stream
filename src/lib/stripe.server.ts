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

// International processing fee — applied when buyer or seller is outside
// the USA. Helps cover cross-border card processing, FX conversion, and
// dispute exposure. Routed entirely to the platform Stripe account via the
// Connect application_fee_amount split (NOT to the seller).
export const INTL_PROCESSING_FEE_RATE = 0.04; // 4%

// Tip platform fee — platform takes 10% of tip amount before payout.
export const TIP_PLATFORM_FEE_RATE = 0.10;

// Legacy export kept for any code still importing it. Buyer marketplace
// purchases now use a fixed fee instead of these percentages.
export const PLATFORM_FEE_RATE = 0.05;
export const BUYER_SERVICE_FEE_RATE = 0.0145;
export const BUYER_SERVICE_FEE_FIXED_CENTS = 15;

// Marketplace commission — platform takes 5% of every marketplace subtotal
// (auctions AND fixed-price). Deducted from seller payout via the Connect
// application_fee_amount split. Phase 2: now applied uniformly.
export const MARKETPLACE_COMMISSION_RATE = 0.05;

// Stripe card processing fees (US standard: 2.9% + $0.30).
// Phase 2: passed through to the buyer in `calculateFees`, so sellers
// never see Stripe fees deducted from their subtotal.
export const STRIPE_PROCESSING_RATE = 0.029;
export const STRIPE_PROCESSING_FIXED_CENTS = 30;

/**
 * Gross-up the Stripe processing fee so the buyer covers it entirely.
 * Solve B such that B - (B * rate + fixed) = preFee. Returns the extra
 * cents added on top of `preFeeCents`.
 */
function grossedUpStripeFeeCents(preFeeCents: number): number {
  if (preFeeCents <= 0) return 0;
  const buyerTotal = (preFeeCents + STRIPE_PROCESSING_FIXED_CENTS) / (1 - STRIPE_PROCESSING_RATE);
  return Math.ceil(buyerTotal - preFeeCents);
}

/**
 * Marketplace purchase fees (Phase 2).
 *  - Buyer pays: subtotal + platformFee + intlFee + Stripe processing fee.
 *  - Platform application_fee_amount covers: platformFee + intlFee +
 *    5% commission + Stripe processing fee + sellerAbsorbedFee.
 *  - Net result: seller receives exactly (subtotal - commission - sellerAbsorbedFee).
 */
export function calculateFees(
  subtotalCents: number,
  opts?: {
    isInternational?: boolean;
    platformFeeCentsOverride?: number;
    commissionRate?: number;
  },
) {
  const platformFee =
    typeof opts?.platformFeeCentsOverride === "number"
      ? Math.max(0, Math.round(opts.platformFeeCentsOverride))
      : BUYER_PLATFORM_FEE_CENTS;
  const intlFee = opts?.isInternational
    ? Math.round(subtotalCents * INTL_PROCESSING_FEE_RATE)
    : 0;
  // Bundle discount: seller absorbs the difference so platform still nets
  // the same per-order margin even when the buyer fee is waived.
  const sellerAbsorbedFee = BUYER_PLATFORM_FEE_CENTS - platformFee;
  const commissionRate = typeof opts?.commissionRate === "number"
    ? opts.commissionRate
    : MARKETPLACE_COMMISSION_RATE;
  const commissionCents = Math.round(subtotalCents * commissionRate);
  const preFeeBuyerCents = subtotalCents + platformFee + intlFee;
  const processingFee = grossedUpStripeFeeCents(preFeeBuyerCents);
  const buyerTotal = preFeeBuyerCents + processingFee;
  const applicationFee =
    platformFee + intlFee + commissionCents + sellerAbsorbedFee + processingFee;
  const sellerNet = subtotalCents - commissionCents - sellerAbsorbedFee;
  return {
    subtotalCents,
    platformFee,
    sellerAbsorbedFee,
    intlFee,
    commissionCents,
    commissionRate,
    processingFee,
    isInternational: Boolean(opts?.isInternational),
    applicationFee,
    sellerNet,
    buyerServiceFee: platformFee,
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
