import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { openReviewWeeks } from "./vipReview.server";
import { easternWeekStart } from "./feePolicy";

describe("VIP review weeks", () => {
  it("covers the current week plus the prior weeks still inside the 14-day window, across DST", () => {
    const weeks = openReviewWeeks(new Date("2026-11-04T15:00:00Z"));
    expect(weeks.map((w) => w.toISOString())).toEqual([
      "2026-11-02T05:00:00.000Z", "2026-10-26T04:00:00.000Z", "2026-10-19T04:00:00.000Z", "2026-10-12T04:00:00.000Z",
    ]);
  });
  it("assigns a Sunday 11:59 PM ET payment to the week that is closing", () => {
    expect(easternWeekStart(new Date("2026-11-09T04:59:00Z")).toISOString()).toBe("2026-11-02T05:00:00.000Z");
  });
});

describe("commission allocation wiring", () => {
  it("live and marketplace checkouts take commission from the locked allocator, never a bare read", () => {
    for (const f of ["src/lib/stripe-connect.functions.ts", "src/lib/auctionCharge.functions.ts"]) {
      const code = readFileSync(f, "utf8");
      expect(code).toContain("allocateOrderCommissions");
      expect(code).not.toContain("sellerPriorWeekSalesCents(supabaseAdmin");
    }
  });
});
