import { describe, it, expect } from "vitest";
import { approvalBlocker } from "./approval";
import { recheckOutcome } from "./cjImport";
const ok = { computed_price_cents: 803, below_floor: false, sync_status: "ok", review_status: "pending" };
describe("supplier publishing gate", () => {
  it("allows fully verified options", () => expect(approvalBlocker([ok, ok])).toBeNull());
  it("blocks any option below the profit floor", () => expect(approvalBlocker([ok, { ...ok, below_floor: true }])).toMatch(/minimum profit/));
  it("blocks any option without a confirmed CJ quote", () => expect(approvalBlocker([ok, { ...ok, sync_status: "unverified" }])).toMatch(/shipping quote/));
  it("blocks stale options", () => expect(approvalBlocker([{ ...ok, sync_status: "stale" }])).not.toBeNull());
  it("ignores rejected options", () => expect(approvalBlocker([ok, { ...ok, below_floor: true, review_status: "rejected" }])).toBeNull());
});
describe("CJ recheck", () => {
  it("a supplier price rise forces review", () => expect(recheckOutcome({ supplierCostCents: 549 }, { itemCostCents: 80, shippingCents: 485, shippingConfirmed: true, stock: 10 })).toMatchObject({ changed: true, needsReview: true, freshCost: 565 }));
  it("a shipping change forces review", () => expect(recheckOutcome({ supplierCostCents: 549 }, { itemCostCents: 64, shippingCents: 500, shippingConfirmed: true, stock: 10 }).needsReview).toBe(true));
  it("no change keeps selling", () => expect(recheckOutcome({ supplierCostCents: 549 }, { itemCostCents: 64, shippingCents: 485, shippingConfirmed: true, stock: 10 })).toMatchObject({ changed: false, needsReview: false, syncStatus: "ok" }));
  it("missing quote is unverified", () => expect(recheckOutcome({ supplierCostCents: 549 }, { itemCostCents: 64, shippingCents: null, shippingConfirmed: false, stock: 10 })).toMatchObject({ needsReview: true, syncStatus: "unverified" }));
});
