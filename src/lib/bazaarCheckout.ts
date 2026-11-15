/**
 * Pure, browser-safe rules for PB Bazaar retail checkout (Buy Now and cart share these).
 * Server code re-validates everything; nothing here is trusted as proof of payment.
 */
import type { CartItem } from "./bazaarShopping";

export const CHECKOUT_HOLD_SECONDS = 33 * 60; // > Stripe's 30-minute minimum, leaving room for request time
export const STRIPE_MIN_SESSION_SECONDS = 30 * 60;
export const MAX_LINE_QUANTITY = 50;
export const MAX_CART_LINES = 50;
export const BAZAAR_TAX_CODE = "txcd_99999999"; // general tangible goods

export type CheckoutSource = "buy_now" | "cart";
export type CheckoutLine = { variantId: string; quantity: number };
export type ShippingAddress = { name: string; line1: string; line2?: string; city: string; state: string; postalCode: string; country: "US"; phone?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Buy Now = exactly one selected option; cart = several. Duplicate options are combined. */
export function normalizeCheckoutLines(source: CheckoutSource, items: CheckoutLine[]): CheckoutLine[] {
  if (!Array.isArray(items) || !items.length) throw new Error("Your checkout is empty.");
  if (source === "buy_now" && items.length !== 1) throw new Error("Buy Now checks out one product at a time.");
  if (items.length > MAX_CART_LINES) throw new Error("Too many items in one checkout.");
  const merged = new Map<string, number>();
  for (const i of items) {
    if (!UUID.test(i.variantId)) throw new Error("Invalid product option.");
    if (!Number.isInteger(i.quantity) || i.quantity < 1) throw new Error("Choose a valid quantity.");
    merged.set(i.variantId, (merged.get(i.variantId) ?? 0) + i.quantity);
  }
  const lines = [...merged].map(([variantId, quantity]) => ({ variantId, quantity }));
  if (lines.some((l) => l.quantity > MAX_LINE_QUANTITY)) throw new Error(`You can buy up to ${MAX_LINE_QUANTITY} of one option per order.`);
  return lines;
}

/** One whole-second expiration used for BOTH the Stripe session and the stock hold. */
export function checkoutExpiry(nowMs: number): { epoch: number; iso: string } {
  const epoch = Math.floor(nowMs / 1000) + CHECKOUT_HOLD_SECONDS;
  return { epoch, iso: new Date(epoch * 1000).toISOString() };
}

/** Confirms Stripe kept our exact expiry and that it satisfies Stripe's 30-minute minimum. */
export function sessionTimingProblem(session: { created: number; expires_at: number }, expectedEpoch: number): string | null {
  if (session.expires_at !== expectedEpoch) return "expiry_mismatch";
  if (session.expires_at - session.created < STRIPE_MIN_SESSION_SECONDS) return "below_stripe_minimum";
  return null;
}

/** True only when Stripe definitely rejected the request (so no session exists). Timeouts/5xx/409/429 are ambiguous. */
export function isDefinitiveStripeRejection(error: unknown): boolean {
  const e = error as { type?: string; statusCode?: number } | null;
  if (!e || typeof e !== "object") return false;
  if (e.type === "StripeConnectionError" || e.type === "StripeAPIError") return false;
  const s = e.statusCode;
  return typeof s === "number" && s >= 400 && s < 500 && s !== 409 && s !== 429;
}

export function validateShippingAddress(a: ShippingAddress): ShippingAddress {
  const t = (v: string | undefined, max: number) => (v ?? "").trim().slice(0, max);
  const out: ShippingAddress = { name: t(a.name, 120), line1: t(a.line1, 200), line2: t(a.line2, 200) || undefined, city: t(a.city, 100), state: t(a.state, 2).toUpperCase(), postalCode: t(a.postalCode, 10), country: "US", phone: t(a.phone, 30) || undefined };
  if (a.country !== "US") throw new Error("PB Bazaar ships to US addresses only right now.");
  if (!out.name || !out.line1 || !out.city) throw new Error("Enter your full name, street address and city.");
  if (!/^[A-Z]{2}$/.test(out.state)) throw new Error("Enter a 2-letter state code.");
  if (!/^\d{5}(-\d{4})?$/.test(out.postalCode)) throw new Error("Enter a valid ZIP code.");
  return out;
}

export type VerifiedTax = { taxCents: number; taxableCents: number; rateBps: number; jurisdiction: string; provider: "stripe_tax"; reference: string; country: "US"; state: string };

/** Turns a Stripe Tax calculation into an auditable result. Anything unresolved throws, which blocks checkout. */
export function verifiedTaxFromCalculation(calc: { id?: string | null; tax_amount_exclusive?: number | null; tax_breakdown?: unknown[] | null } | null, taxableCents: number, address: ShippingAddress): VerifiedTax {
  if (!calc?.id) throw new Error("Sales tax couldn't be verified for this address, so checkout is paused.");
  const tax = calc.tax_amount_exclusive;
  if (!Number.isInteger(tax) || (tax as number) < 0) throw new Error("Sales tax couldn't be verified for this address, so checkout is paused.");
  if (!Array.isArray(calc.tax_breakdown) || !calc.tax_breakdown.length) throw new Error("Sales tax couldn't be verified for this address, so checkout is paused.");
  if (!Number.isInteger(taxableCents) || taxableCents <= 0) throw new Error("Invalid order total.");
  return { taxCents: tax as number, taxableCents, rateBps: Math.round(((tax as number) * 10000) / taxableCents), jurisdiction: `US-${address.state}-${address.postalCode.slice(0, 5)}`, provider: "stripe_tax", reference: `stripe_tax:${calc.id}`, country: "US", state: address.state };
}

/** After a verified cart order: remove only the ordered quantities; Buy Now never calls this. */
export function removeOrderedFromCart(cart: CartItem[], ordered: CheckoutLine[]): CartItem[] {
  return cart.flatMap((c) => {
    const o = ordered.find((x) => x.variantId === c.variantId);
    if (!o) return [c];
    const left = c.quantity - o.quantity;
    return left > 0 ? [{ ...c, quantity: left }] : [];
  });
}

export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending_payment: "Waiting for payment",
  awaiting_fulfillment_approval: "Paid — awaiting fulfillment approval",
  paid_inventory_exception: "Paid — under review",
  fulfillment_authorized: "Approved for fulfillment",
  shipped: "Shipped",
  delivered: "Delivered",
  canceled: "Canceled",
  payment_failed: "Payment failed",
  expired: "Checkout expired",
};

/**
 * Calls Stripe with the SAME idempotency key on every attempt (the caller bakes it into `create`).
 * 'rejected' = Stripe definitely made no session → safe to release stock. 'unknown' = keep the hold.
 */
export async function createSessionWithRetry<T>(create: () => Promise<T>, attempts = 3): Promise<{ outcome: "created"; session: T } | { outcome: "rejected" | "unknown"; error: unknown }> {
  let last: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try { return { outcome: "created", session: await create() }; }
    catch (e) { last = e; if (isDefinitiveStripeRejection(e)) return { outcome: "rejected", error: e }; }
  }
  return { outcome: "unknown", error: last };
}
