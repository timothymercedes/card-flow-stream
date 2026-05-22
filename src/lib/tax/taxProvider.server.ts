/**
 * Tax provider abstraction.
 *
 * The marketplace currently uses a lightweight US state-rate table
 * (`StateTableTaxProvider`). The same `quoteTax()` signature is designed to
 * be swappable for a Stripe Tax (or TaxJar) provider later WITHOUT
 * touching the checkout UI, payout math, order schema, or admin
 * accounting — every caller goes through this module and only stores the
 * normalized fields below on each order.
 *
 * To switch providers in the future:
 *   1. Implement a new `TaxProvider` (e.g. `StripeTaxProvider`) that calls
 *      the external engine inside `quoteTax`.
 *   2. Update `getTaxProvider()` to return it (gate by env var or feature
 *      flag). No other code changes are required.
 *
 * Tax economics: tax cents flow on TOP of the buyer total and are added
 * to `application_fee_amount` so the platform receives the collected tax
 * (marketplace facilitator model). Seller payout (`sellerNet`) is
 * unaffected by tax. Tax never enters processing-fee gross-up or
 * commission math.
 */
import { calculateTaxCents, salesTaxRate } from "@/lib/salesTax";

export type TaxQuoteInput = {
  /** Item subtotal in cents (pre-shipping, pre-tax). */
  itemCents: number;
  /** Shipping in cents — taxable in most US states when part of a taxable sale. */
  shippingCents: number;
  /** Buyer destination country (ISO-2). Non-US → 0 tax (customs handled separately). */
  buyerCountry?: string | null;
  /** Buyer destination state/region. */
  buyerState?: string | null;
  /** Optional seller id — reserved for future origin-based or nexus logic. */
  sellerId?: string | null;
};

export type TaxQuote = {
  /** Tax to charge the buyer, in cents. */
  taxCents: number;
  /** Base amount tax was computed on (item + shipping). */
  taxableSubtotalCents: number;
  /** Applied rate in basis points (725 = 7.25%). */
  taxRateBps: number;
  /** Human label of the jurisdiction (e.g. "US-CA"). Null for non-taxed regions. */
  jurisdiction: string | null;
  /** Which engine produced this quote — persisted for audit/reporting. */
  provider: "state_table" | "stripe_tax" | "taxjar" | "none";
  /** Snapshot of buyer destination so orders are auditable later. */
  country: string | null;
  state: string | null;
};

export interface TaxProvider {
  readonly name: TaxQuote["provider"];
  quoteTax(input: TaxQuoteInput): Promise<TaxQuote>;
}

/** Default provider — US state flat-rate table. Used today. */
class StateTableTaxProvider implements TaxProvider {
  readonly name = "state_table" as const;

  async quoteTax(input: TaxQuoteInput): Promise<TaxQuote> {
    const country = (input.buyerCountry || "").toUpperCase() || null;
    const state = (input.buyerState || "").toUpperCase() || null;
    const taxableSubtotalCents = Math.max(0, Math.round(input.itemCents + input.shippingCents));
    const rate = salesTaxRate(country, state);
    const taxCents = calculateTaxCents(taxableSubtotalCents, country, state);
    const taxed = rate > 0 && taxCents > 0;
    return {
      taxCents,
      taxableSubtotalCents,
      taxRateBps: Math.round(rate * 10000),
      jurisdiction: taxed ? `${country}-${state}` : null,
      provider: "state_table",
      country,
      state,
    };
  }
}

/**
 * Stripe Tax placeholder. Not wired yet — left here so the swap is a
 * one-line change in `getTaxProvider()` later. When enabling:
 *  - Compute tax via `stripe.tax.calculations.create(...)` inside `quoteTax`.
 *  - Pass `automatic_tax: { enabled: true }` (or a calculation id) when
 *    creating the PaymentIntent.
 *  - Persist the same normalized fields on `orders` (taxCents,
 *    taxableSubtotalCents, taxRateBps, jurisdiction, provider).
 */
// class StripeTaxProvider implements TaxProvider { ... }

let _provider: TaxProvider | null = null;

export function getTaxProvider(): TaxProvider {
  if (_provider) return _provider;
  // Future: `if (process.env.TAX_PROVIDER === "stripe_tax") return new StripeTaxProvider();`
  _provider = new StateTableTaxProvider();
  return _provider;
}

/** Convenience wrapper used by checkout / auction / preview code paths. */
export async function quoteTax(input: TaxQuoteInput): Promise<TaxQuote> {
  return getTaxProvider().quoteTax(input);
}
