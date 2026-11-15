import { describe, expect, it, vi } from "vitest";
import { checkoutExpiry, createSessionWithRetry, isDefinitiveStripeRejection, normalizeCheckoutLines, removeOrderedFromCart, sessionTimingProblem, validateShippingAddress, verifiedTaxFromCalculation, STRIPE_MIN_SESSION_SECONDS } from "./bazaarCheckout";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const addr = { name: "Pat Buyer", line1: "1 Market St", city: "San Francisco", state: "ca", postalCode: "94105", country: "US" as const };

describe("Buy Now vs cart lines", () => {
  it("Buy Now accepts exactly one selected option", () => {
    expect(normalizeCheckoutLines("buy_now", [{ variantId: A, quantity: 2 }])).toEqual([{ variantId: A, quantity: 2 }]);
    expect(() => normalizeCheckoutLines("buy_now", [{ variantId: A, quantity: 1 }, { variantId: B, quantity: 1 }])).toThrow();
  });
  it("cart supports several products and combines repeated options", () => {
    expect(normalizeCheckoutLines("cart", [{ variantId: A, quantity: 1 }, { variantId: B, quantity: 3 }, { variantId: A, quantity: 2 }])).toEqual([{ variantId: A, quantity: 3 }, { variantId: B, quantity: 3 }]);
  });
  it("rejects empty checkouts and bad quantities", () => {
    expect(() => normalizeCheckoutLines("cart", [])).toThrow();
    expect(() => normalizeCheckoutLines("cart", [{ variantId: A, quantity: 0 }])).toThrow();
    expect(() => normalizeCheckoutLines("cart", [{ variantId: A, quantity: 51 }])).toThrow();
  });
});

describe("checkout expiration", () => {
  it("is a whole-second epoch more than 30 minutes away, shared by Stripe and the hold", () => {
    const now = Date.UTC(2026, 10, 15, 13, 0, 0, 789);
    const e = checkoutExpiry(now);
    expect(Number.isInteger(e.epoch)).toBe(true);
    expect(e.iso.endsWith(".000Z")).toBe(true);
    expect(new Date(e.iso).getTime() / 1000).toBe(e.epoch);
    expect(e.epoch - Math.floor(now / 1000)).toBeGreaterThan(STRIPE_MIN_SESSION_SECONDS);
  });
  it("accepts a session that kept our expiry and meets Stripe's 30-minute minimum", () => {
    expect(sessionTimingProblem({ created: 1000, expires_at: 1000 + 1980 }, 2980)).toBeNull();
  });
  it("rejects a changed expiry or one under 30 minutes after creation (boundary)", () => {
    expect(sessionTimingProblem({ created: 1000, expires_at: 2999 }, 2980)).toBe("expiry_mismatch");
    expect(sessionTimingProblem({ created: 1181, expires_at: 2980 }, 2980)).toBe("below_stripe_minimum"); // 1799s
    expect(sessionTimingProblem({ created: 1180, expires_at: 2980 }, 2980)).toBeNull(); // exactly 1800s
  });
});

describe("Stripe timeout / retry", () => {
  it("retries with the same request after a timeout and returns the one session", async () => {
    const create = vi.fn().mockRejectedValueOnce({ type: "StripeConnectionError" }).mockResolvedValueOnce({ id: "cs_1" });
    const r = await createSessionWithRetry(create);
    expect(r).toEqual({ outcome: "created", session: { id: "cs_1" } });
    expect(create).toHaveBeenCalledTimes(2);
  });
  it("reports 'unknown' (keep the hold) when every attempt times out", async () => {
    const r = await createSessionWithRetry(() => Promise.reject({ type: "StripeConnectionError" }));
    expect(r.outcome).toBe("unknown");
  });
  it("reports 'rejected' (safe to release) only for definitive 4xx errors", async () => {
    expect((await createSessionWithRetry(() => Promise.reject({ type: "StripeInvalidRequestError", statusCode: 400 }))).outcome).toBe("rejected");
    expect(isDefinitiveStripeRejection({ statusCode: 409 })).toBe(false);
    expect(isDefinitiveStripeRejection({ statusCode: 429 })).toBe(false);
    expect(isDefinitiveStripeRejection({ type: "StripeAPIError", statusCode: 500 })).toBe(false);
  });
});

describe("tax verification", () => {
  it("records provider reference, jurisdiction, rate and tax", () => {
    const t = verifiedTaxFromCalculation({ id: "taxcalc_1", tax_amount_exclusive: 863, tax_breakdown: [{}] }, 10000, validateShippingAddress(addr));
    expect(t).toMatchObject({ taxCents: 863, rateBps: 863, jurisdiction: "US-CA-94105", reference: "stripe_tax:taxcalc_1", provider: "stripe_tax" });
  });
  it("blocks checkout when tax is unresolved", () => {
    const a = validateShippingAddress(addr);
    expect(() => verifiedTaxFromCalculation(null, 1000, a)).toThrow(/paused/);
    expect(() => verifiedTaxFromCalculation({ id: "taxcalc_1", tax_amount_exclusive: null, tax_breakdown: [{}] }, 1000, a)).toThrow(/paused/);
    expect(() => verifiedTaxFromCalculation({ id: "taxcalc_1", tax_amount_exclusive: 0, tax_breakdown: [] }, 1000, a)).toThrow(/paused/);
  });
  it("accepts US addresses only and requires a state and ZIP", () => {
    expect(() => validateShippingAddress({ ...addr, country: "CA" as never })).toThrow();
    expect(() => validateShippingAddress({ ...addr, state: "" })).toThrow();
    expect(() => validateShippingAddress({ ...addr, postalCode: "9410" })).toThrow();
  });
});

describe("cart after a paid cart order", () => {
  it("removes only the ordered quantities and keeps everything else", () => {
    const cart = [{ productId: A, variantId: A, quantity: 3, seenPrice: 500 }, { productId: B, variantId: B, quantity: 1, seenPrice: 900 }];
    expect(removeOrderedFromCart(cart, [{ variantId: A, quantity: 2 }])).toEqual([{ productId: A, variantId: A, quantity: 1, seenPrice: 500 }, cart[1]]);
    expect(removeOrderedFromCart(cart, [{ variantId: B, quantity: 1 }])).toEqual([cart[0]]);
  });
});
