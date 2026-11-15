import { describe, it, expect } from "vitest";
import { checkOrderPaymentSettled, type SettlingOrder } from "./orderSettlement";

const order = (o: Partial<SettlingOrder> = {}): SettlingOrder => ({
  id: "o1", buyer_id: "b1", payment_status: "awaiting_payment", stripe_payment_intent_id: "pi_1",
  tax_reconciliation_details: { payment_intent_total_cents: 2599 }, ...o,
});
const pi = (p: any = {}) => ({ id: "pi_1", status: "succeeded", amount_received: 2599, currency: "usd", metadata: { buyer_id: "b1" }, ...p });

describe("checkOrderPaymentSettled", () => {
  it("settles a succeeded intent with exact amount", () => {
    expect(checkOrderPaymentSettled(pi(), ["o1"], [order()])).toEqual({ ok: true, settleIds: ["o1"] });
  });
  for (const status of ["requires_payment_method", "processing", "canceled", "requires_action"]) {
    it(`refuses ${status}`, () => expect(checkOrderPaymentSettled(pi({ status }), ["o1"], [order()]).ok).toBe(false));
  }
  it("refuses an amount lower than the order total", () => {
    expect(checkOrderPaymentSettled(pi({ amount_received: 2598 }), ["o1"], [order()])).toEqual({ ok: false, reason: "amount_mismatch" });
  });
  it("refuses an amount higher than the order total", () => {
    expect(checkOrderPaymentSettled(pi({ amount_received: 2600 }), ["o1"], [order()])).toEqual({ ok: false, reason: "amount_mismatch" });
  });
  it("refuses another buyer's order", () => {
    expect(checkOrderPaymentSettled(pi({ metadata: { buyer_id: "b2" } }), ["o1"], [order()])).toEqual({ ok: false, reason: "buyer_mismatch" });
  });
  it("refuses orders not bound to this intent", () => {
    expect(checkOrderPaymentSettled(pi(), ["o1"], [order({ stripe_payment_intent_id: "pi_other" })])).toEqual({ ok: false, reason: "intent_not_bound" });
  });
  it("refuses when an order is missing", () => {
    expect(checkOrderPaymentSettled(pi(), ["o1", "o2"], [order()])).toEqual({ ok: false, reason: "orders_not_found" });
  });
  it("refuses non-USD currency", () => {
    expect(checkOrderPaymentSettled(pi({ currency: "eur" }), ["o1"], [order()]).ok).toBe(false);
  });
  it("refuses cancelled or refunded orders", () => {
    expect(checkOrderPaymentSettled(pi(), ["o1"], [order({ payment_status: "refunded" })])).toEqual({ ok: false, reason: "order_not_payable" });
  });
  it("is idempotent for already paid orders (no double processing)", () => {
    expect(checkOrderPaymentSettled(pi(), ["o1"], [order({ payment_status: "paid" })])).toEqual({ ok: true, settleIds: [] });
  });
  it("refuses when the expected total was never recorded", () => {
    expect(checkOrderPaymentSettled(pi(), ["o1"], [order({ tax_reconciliation_details: null })])).toEqual({ ok: false, reason: "missing_expected_total" });
  });
  it("settles a multi-order cart only with the shared exact total", () => {
    const o2 = order({ id: "o2" });
    expect(checkOrderPaymentSettled(pi(), ["o1", "o2"], [order(), o2])).toEqual({ ok: true, settleIds: ["o1", "o2"] });
  });
});
