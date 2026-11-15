import { describe, it, expect } from "vitest";
import { qualifyVariant, productDecision } from "./cjQualify";
const good = { stock: 5, shippingConfirmed: true, shippingCents: 400, priceCents: 1500, profitCents: 250, belowFloor: false };
describe("Stage 2 qualification", () => {
  it("passes a stocked, shippable option with $2.50 profit", () => expect(qualifyVariant(good)).toEqual({ ok: true }));
  it("passes exactly $2.00 profit", () => expect(qualifyVariant({ ...good, profitCents: 200 }).ok).toBe(true));
  it("rejects $1.99 profit", () => expect(qualifyVariant({ ...good, profitCents: 199 })).toEqual({ ok: false, reason: "below_floor" }));
  it("rejects zero stock", () => expect(qualifyVariant({ ...good, stock: 0 })).toEqual({ ok: false, reason: "out_of_stock" }));
  it("rejects unknown stock", () => expect(qualifyVariant({ ...good, stock: null })).toEqual({ ok: false, reason: "out_of_stock" }));
  it("rejects estimated (unconfirmed) US shipping", () => expect(qualifyVariant({ ...good, shippingConfirmed: false })).toEqual({ ok: false, reason: "no_us_shipping" }));
  it("publishes when one option qualifies", () => expect(productDecision([{ ok: false, reason: "below_floor" }, { ok: true }])).toEqual({ publish: true }));
  it("keeps hidden when none qualify", () => expect(productDecision([{ ok: false, reason: "below_floor" }])).toEqual({ publish: false, reason: "below_floor" }));
  it("keeps hidden with no options", () => expect(productDecision([])).toEqual({ publish: false, reason: "no_options" }));
});
