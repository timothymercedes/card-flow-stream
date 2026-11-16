export type InsightOrder = { amount: number | null; payment_status: string | null; status: string | null; description: string | null; listing_id: string | null; created_at: string; stream_id: string | null };

const isPaid = (o: InsightOrder) => o.payment_status === "paid" || o.payment_status === "succeeded";

/** Pure seller summary: only paid orders count toward revenue; refunded/unpaid never inflate stats. */
export function summarizeSales(orders: InsightOrder[], now = Date.now()) {
  const paid = orders.filter(isPaid).filter(o => o.status !== "refunded" && o.status !== "cancelled");
  const day = 86400000;
  const in30 = paid.filter(o => now - new Date(o.created_at).getTime() <= 30 * day);
  const revenue = paid.reduce((s, o) => s + Number(o.amount || 0), 0);
  const revenue30 = in30.reduce((s, o) => s + Number(o.amount || 0), 0);
  const top = new Map<string, { name: string; count: number; total: number }>();
  for (const o of paid) {
    const key = o.listing_id ?? o.description ?? "Item";
    const cur = top.get(key) ?? { name: o.description || "Item", count: 0, total: 0 };
    cur.count++; cur.total += Number(o.amount || 0); top.set(key, cur);
  }
  return {
    sold: paid.length, sold30: in30.length, revenue, revenue30,
    avg: paid.length ? revenue / paid.length : 0,
    liveSales: paid.filter(o => o.stream_id).length,
    top: [...top.values()].sort((a, b) => b.total - a.total).slice(0, 5),
  };
}
