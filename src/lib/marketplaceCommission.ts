/**
 * Trusted marketplace commission. Order rows are buyer-creatable, so the
 * stored commission_rate is never used to price a checkout or payout.
 */
export const TRUSTED_MARKETPLACE_COMMISSION_RATE = 0.05;

/** Ignores any client-supplied rate and returns the trusted server rate. */
export function trustedCommissionRate(_clientSupplied?: unknown): number {
  return TRUSTED_MARKETPLACE_COMMISSION_RATE;
}

/** Commission and seller payout (before processing fees) for an item subtotal. */
export function computeCommission(itemSubtotalCents: number) {
  const subtotal = Math.max(0, Math.round(itemSubtotalCents));
  const commissionCents = Math.round(subtotal * TRUSTED_MARKETPLACE_COMMISSION_RATE);
  return { commissionRate: TRUSTED_MARKETPLACE_COMMISSION_RATE, commissionCents, sellerGrossCents: subtotal - commissionCents };
}
