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

// Platform fee: 5% of subtotal
export const PLATFORM_FEE_RATE = 0.05;
// Buyer service fee (~50% of estimated Stripe processing fee: 2.9% + 30¢, so buyer pays ~1.45% + 15¢)
export const BUYER_SERVICE_FEE_RATE = 0.0145;
export const BUYER_SERVICE_FEE_FIXED_CENTS = 15;

export function calculateFees(subtotalCents: number) {
  const platformFee = Math.round(subtotalCents * PLATFORM_FEE_RATE);
  const buyerServiceFee = Math.round(subtotalCents * BUYER_SERVICE_FEE_RATE) + BUYER_SERVICE_FEE_FIXED_CENTS;
  const buyerTotal = subtotalCents + buyerServiceFee;
  return { subtotalCents, platformFee, buyerServiceFee, buyerTotal };
}
