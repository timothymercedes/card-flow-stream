/**
 * Decides whether a Stripe PaymentIntent may transition marketplace orders
 * to "paid". Pure so it can be unit tested. Used by the signed webhook.
 */
export type SettlingIntent = {
  id?: string | null;
  status?: string | null;
  amount_received?: number | null;
  currency?: string | null;
  metadata?: Record<string, string | undefined> | null;
};

export type SettlingOrder = {
  id: string;
  buyer_id: string;
  payment_status: string | null;
  stripe_payment_intent_id: string | null;
  tax_reconciliation_details?: { payment_intent_total_cents?: number | null } | null;
};

export type OrderSettlementCheck =
  | { ok: true; settleIds: string[] }
  | { ok: false; reason: string };

export function checkOrderPaymentSettled(
  pi: SettlingIntent | null | undefined,
  requestedIds: string[],
  orders: SettlingOrder[],
): OrderSettlementCheck {
  if (!pi?.id) return { ok: false, reason: "missing_intent" };
  if (pi.status !== "succeeded") return { ok: false, reason: `not_settled:${pi.status ?? "unknown"}` };
  if ((pi.currency ?? "").toLowerCase() !== "usd") return { ok: false, reason: "currency_mismatch" };
  const ids = Array.from(new Set(requestedIds.filter(Boolean)));
  if (ids.length === 0) return { ok: false, reason: "no_orders" };
  if (orders.length !== ids.length || !ids.every((id) => orders.some((o) => o.id === id))) {
    return { ok: false, reason: "orders_not_found" };
  }
  const buyer = pi.metadata?.buyer_id;
  if (!buyer) return { ok: false, reason: "missing_buyer" };
  for (const o of orders) {
    if (o.buyer_id !== buyer) return { ok: false, reason: "buyer_mismatch" };
    if (o.stripe_payment_intent_id !== pi.id) return { ok: false, reason: "intent_not_bound" };
  }
  // Already-paid orders are skipped (Stripe retries); anything else non-awaiting is refused.
  const unpaid = orders.filter((o) => o.payment_status !== "paid");
  if (unpaid.length === 0) return { ok: true, settleIds: [] };
  if (unpaid.some((o) => o.payment_status !== "awaiting_payment" && o.payment_status !== "failed" && o.payment_status !== "payment_failed")) {
    return { ok: false, reason: "order_not_payable" };
  }
  const totals = orders.map((o) => Number(o.tax_reconciliation_details?.payment_intent_total_cents));
  const expected = totals[0];
  if (!Number.isInteger(expected) || expected <= 0 || totals.some((t) => t !== expected)) {
    return { ok: false, reason: "missing_expected_total" };
  }
  if (pi.amount_received !== expected) return { ok: false, reason: "amount_mismatch" };
  return { ok: true, settleIds: unpaid.map((o) => o.id) };
}
