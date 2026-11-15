/**
 * Verifies that a Stripe PaymentIntent returned from an offer capture actually
 * settled before a paid order is created. Pure so it can be unit tested.
 */
export type CapturedIntentLike = {
  id?: string | null;
  status?: string | null;
  amount_received?: number | null;
  currency?: string | null;
  metadata?: Record<string, string | undefined> | null;
};

export type OfferLike = {
  payment_intent_id: string;
  buyer_id: string;
  queue_item_id: string;
  amount: number | string;
};

export type SettlementCheck = { ok: true } | { ok: false; reason: string };

export function checkOfferCaptureSettled(pi: CapturedIntentLike | null | undefined, offer: OfferLike): SettlementCheck {
  if (!pi) return { ok: false, reason: "missing_intent" };
  if (pi.id !== offer.payment_intent_id) return { ok: false, reason: "intent_mismatch" };
  if (pi.status !== "succeeded") return { ok: false, reason: `not_settled:${pi.status ?? "unknown"}` };
  if ((pi.currency ?? "usd").toLowerCase() !== "usd") return { ok: false, reason: "currency_mismatch" };
  const expected = Math.round(Number(offer.amount) * 100);
  if (!Number.isFinite(expected) || expected <= 0) return { ok: false, reason: "invalid_offer_amount" };
  if (!Number.isFinite(pi.amount_received) || (pi.amount_received as number) < expected) {
    return { ok: false, reason: "amount_short" };
  }
  const md = pi.metadata || {};
  if (md.kind !== "queue_offer") return { ok: false, reason: "wrong_kind" };
  if (md.buyer_id !== offer.buyer_id) return { ok: false, reason: "buyer_mismatch" };
  if (md.queue_item_id !== offer.queue_item_id) return { ok: false, reason: "item_mismatch" };
  return { ok: true };
}
