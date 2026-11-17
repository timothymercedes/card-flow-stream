/** Shopify retail price: 15% markup, raised so contribution after card fees (2.9% + $0.30) is at least $3. Cents, rounded up. */
export const SHOPIFY_MARKUP = 0.15;
export const SHOPIFY_FLOOR_CENTS = 300;
export const CARD_FEE_PCT = 0.029;
export const CARD_FEE_FIXED_CENTS = 30;

export function shopifyPriceCents(costCents: number): number {
  const markup = Math.ceil(Math.round(costCents * (1 + SHOPIFY_MARKUP) * 1e6) / 1e6);
  const floor = Math.ceil(Math.round(((costCents + CARD_FEE_FIXED_CENTS + SHOPIFY_FLOOR_CENTS) / (1 - CARD_FEE_PCT)) * 1e6) / 1e6);
  return Math.max(markup, floor);
}

/** Contribution after card fees (not net profit), floored to a whole cent. */
export function shopifyContributionCents(priceCents: number, costCents: number): number {
  return Math.floor(priceCents * (1 - CARD_FEE_PCT) - costCents - CARD_FEE_FIXED_CENTS);
}

/** Link SKUs look like "<sku>#<shopifyVariantId>". */
export function shopifyVariantIdFromSku(sku: string | null | undefined): string | null {
  const m = /#(\d+)$/.exec(sku ?? "");
  return m ? m[1] : null;
}
