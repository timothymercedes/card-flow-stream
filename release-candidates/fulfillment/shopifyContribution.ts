/** Review-only pricing. Never imported by the application or used to write prices. */
export function previewShopifyContribution(costCents: number, feePercent: number, fixedFeeCents: number) {
  if (!Number.isSafeInteger(costCents) || costCents <= 0 || !Number.isFinite(feePercent) || feePercent < 0 || feePercent >= 100 || !Number.isSafeInteger(fixedFeeCents) || fixedFeeCents < 0) {
    throw new Error("Invalid cost or card fee configuration");
  }
  const markupPriceCents = Math.ceil(costCents * 115 / 100);
  const minimumPriceCents = Math.ceil((costCents + fixedFeeCents + 200) / (1 - feePercent / 100));
  const proposedPriceCents = Math.max(markupPriceCents, minimumPriceCents);
  return { markupPriceCents, minimumPriceCents, proposedPriceCents,
    contributionCents: proposedPriceCents * (1 - feePercent / 100) - costCents - fixedFeeCents };
}