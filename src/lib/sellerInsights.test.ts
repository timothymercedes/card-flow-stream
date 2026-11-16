import { describe, it, expect } from "vitest";
import { summarizeSales } from "./sellerInsights";
const now = new Date("2026-11-16T00:00:00Z").getTime();
const o = (amount: number, payment_status: string, daysAgo = 1, extra = {}) => ({ amount, payment_status, status: "completed", description: "Card", listing_id: "l1", created_at: new Date(now - daysAgo * 86400000).toISOString(), stream_id: null, ...extra });
describe("summarizeSales", () => {
  it("counts only paid orders as revenue", () => {
    expect(summarizeSales([o(10, "paid"), o(50, "pending")], now).revenue).toBe(10);
  });
  it("excludes refunded orders", () => {
    expect(summarizeSales([o(10, "paid", 1, { status: "refunded" })], now).sold).toBe(0);
  });
  it("splits last 30 days", () => {
    const s = summarizeSales([o(10, "paid", 5), o(20, "paid", 60)], now);
    expect(s.revenue30).toBe(10); expect(s.revenue).toBe(30);
  });
});
