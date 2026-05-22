import type { InsuranceProvider } from "./types";

// Shippo provider — quote is computed locally with a configurable rate;
// purchase is recorded as a placeholder reference. Actual carrier-side
// insurance attachment is handled when buying the Shippo label via
// `parcel.extra.insurance` in shippo.functions.ts.
export const shippoProvider: InsuranceProvider = {
  code: "shippo",
  isActive: true,

  async quote({ coverageCents }) {
    // 1% of declared value + $0.50 base, $1.00 minimum, capped at $50.
    const bps = 100;
    const flat = 50;
    const raw = Math.round((coverageCents * bps) / 10_000) + flat;
    const fee = Math.min(5000, Math.max(100, raw));
    return {
      feeCents: fee,
      coverageCents,
      supportsReasons: ["lost", "damaged"],
      estResolutionDays: 10,
      providerCode: "shippo",
    };
  },

  async purchase({ orderId, coverageCents }) {
    // Real provider reference is written later by the Shippo label
    // purchase flow. This is a soft placeholder so we can mark the
    // insurance as "active" immediately on order creation.
    return {
      providerRef: `pending:${orderId}`,
      feeCents: 0,
      coverageCents,
    };
  },

  async fileClaim({ orderId }) {
    return { providerClaimRef: `manual:${orderId}:${Date.now()}` };
  },

  async refreshClaim() {
    return { status: "under_review" };
  },
};
