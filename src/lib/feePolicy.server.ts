import { easternWeekStart, nextLiveTransactionIndex } from "./feePolicy";

/** Seller's eligible Marketplace + Live sales so far this ET week (merchandise only). */
export async function sellerPriorWeekSalesCents(admin: any, sellerId: string, now = new Date()): Promise<number> {
  const since = easternWeekStart(now).toISOString();
  const { data } = await admin
    .from("orders")
    .select("amount,shipping_amount,refunded_at,status,listing_id,listings(channel)")
    .eq("seller_id", sellerId)
    .eq("payment_status", "paid")
    .gte("paid_at", since);
  return ((data ?? []) as any[]).reduce((sum, o) => {
    const channel = o.listings?.channel;
    if (channel && channel !== "marketplace") return sum; // PB Store / Bazaar excluded
    if (o.refunded_at || ["cancelled", "canceled", "refunded"].includes(String(o.status))) return sum;
    return sum + Math.max(0, Math.round(Number(o.amount || 0) * 100) - Math.round(Number(o.shipping_amount || 0) * 100));
  }, 0);
}

/** Next payment-transaction number for this buyer in this live stream. */
export async function liveTransactionIndex(admin: any, buyerId: string, streamId: string): Promise<number> {
  const { data } = await admin
    .from("orders")
    .select("id,stripe_payment_intent_id")
    .eq("buyer_id", buyerId)
    .eq("stream_id", streamId)
    .eq("payment_status", "paid");
  return nextLiveTransactionIndex((data ?? []) as any[]);
}

/**
 * Per-order seller commission. When `persist` is true each order is allocated through the
 * row-locked, idempotent DB allocator so concurrent checkouts and retries never share the
 * $500 base tier. Sandbox / preview checks use a read-only estimate and write nothing.
 */
export async function allocateOrderCommissions(
  admin: any,
  sellerId: string,
  orders: { id: string; itemCents: number }[],
  persist: boolean,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!persist) {
    const { tieredCommissionCents } = await import("./feePolicy");
    let running = await sellerPriorWeekSalesCents(admin, sellerId);
    for (const o of orders) {
      out.set(o.id, tieredCommissionCents(running, o.itemCents));
      running += Math.max(0, o.itemCents);
    }
    return out;
  }
  for (const o of orders) {
    const { data, error } = await admin.rpc("allocate_seller_weekly_commission", {
      _order_id: o.id, _seller_id: sellerId, _sale_cents: Math.max(0, Math.round(o.itemCents)),
    });
    if (error) throw new Error(`Commission allocation failed: ${error.message}`);
    const row = Array.isArray(data) ? data[0] : data;
    out.set(o.id, Number(row?.commission_cents ?? 0));
  }
  return out;
}
