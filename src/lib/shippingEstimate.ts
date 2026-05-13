type EstimateInput = {
  subtotal: number;
  buyerCountry?: string | null;
  sellerCountry?: string | null;
  quantity?: number | null;
  weightOz?: number | null;
};

const IMPORT_RATES: Record<string, number> = {
  CA: 0.05,
  GB: 0.12,
  EU: 0.12,
  DE: 0.12,
  FR: 0.12,
  PT: 0.12,
  JP: 0.08,
  CN: 0.13,
  AU: 0.10,
};

function cents(n: number) {
  return Math.max(0, Math.round(n * 100));
}

export function money(amount: number) {
  return `$${amount.toFixed(2)}`;
}

export function estimateShippingAndImportFees({ subtotal, buyerCountry, sellerCountry, quantity, weightOz }: EstimateInput) {
  const buyer = (buyerCountry || "US").toUpperCase();
  const seller = (sellerCountry || "US").toUpperCase();
  const qty = Math.max(1, Number(quantity || 1));
  const oz = Math.max(1, Number(weightOz || qty));
  const domestic = buyer === seller;
  const lowValueCard = subtotal <= 20 && oz <= 2;

  const shipping = domestic
    ? lowValueCard ? 0.99 : 4.75 + Math.max(0, oz - 4) * 0.35
    : 15.5 + Math.max(0, oz - 4) * 0.85;
  const rate = domestic ? 0 : (IMPORT_RATES[buyer] ?? IMPORT_RATES[buyer === "US" ? "US" : "EU"] ?? 0.10);
  const importFees = domestic ? 0 : subtotal * rate;

  return {
    shipping,
    importFees,
    total: subtotal + shipping + importFees,
    domestic,
    automated: true,
    label: domestic ? "Auto shipping estimate" : "Auto shipping + import estimate",
    detail: domestic
      ? "Rates are estimated from saved addresses, package size, and seller shipping rules."
      : "Import fees are estimated from buyer/seller countries and may be adjusted by the carrier or customs.",
    shippingCents: cents(shipping),
    importFeeCents: cents(importFees),
  };
}