/** Publishing gate for supplier products: every active option needs a confirmed CJ quote/stock check and a price at or above the profit floor. */
export function approvalBlocker(options: { computed_price_cents: number | null; below_floor: boolean; sync_status: string; review_status: string }[]): string | null {
  const live = options.filter((o) => o.review_status !== "rejected");
  if (!live.length) return "Every option is rejected.";
  if (live.some((o) => o.computed_price_cents == null)) return "Calculate a price for every option of this product first.";
  if (live.some((o) => o.below_floor)) return "At least one option is priced below the minimum profit. Raise the price or reject that option.";
  if (live.some((o) => o.sync_status !== "ok")) return "At least one option has no confirmed CJ shipping quote or stock check. Recheck with CJ, or reject that option.";
  return null;
}
