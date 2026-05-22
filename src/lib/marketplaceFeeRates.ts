/**
 * Public (non-secret) buyer-facing fee constants mirrored from
 * `src/lib/stripe.server.ts` so client UIs (e.g. cart preview) can show
 * the same numbers Stripe will charge at checkout WITHOUT a server round
 * trip. Keep these in sync with the server file.
 */
export const BUYER_PLATFORM_FEE_CENTS = 123; // $1.23
export const INTL_PROCESSING_FEE_RATE = 0.04; // 4%
