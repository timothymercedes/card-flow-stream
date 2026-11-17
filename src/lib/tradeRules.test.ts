import { describe, expect, it } from "vitest";
import { oppositeSide, participantSide, receiptsComplete, retainsTradeLock } from "./tradeRules";
describe("PB Trade participant rules", () => {
  it("assigns Alice only her own shipment and opposite receipt", () => {
    expect(participantSide("alice", "bob", "alice")).toBe("from");
    expect(oppositeSide(participantSide("alice", "bob", "alice"))).toBe("to");
    expect(() => participantSide("alice", "bob", "eve")).toThrow();
  });
  it("requires both receipts for two-sided cards", () => {
    expect(receiptsComplete(true, true, true, false, false)).toBe(false);
    expect(receiptsComplete(true, true, true, true, false)).toBe(true);
    expect(receiptsComplete(true, false, false, true, false)).toBe(true);
  });
  it("blocks completion while an issue remains unresolved", () => {
    expect(receiptsComplete(true, true, true, true, true)).toBe(false);
  });
  it("retains open/disputed locks and releases terminal locks", () => {
    expect(retainsTradeLock("shipped", true)).toBe(true);
    expect(retainsTradeLock("accepted", false)).toBe(true);
    expect(retainsTradeLock("completed", false)).toBe(false);
    expect(retainsTradeLock("cancelled", false)).toBe(false);
  });
});