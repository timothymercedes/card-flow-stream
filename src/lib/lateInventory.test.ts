import { describe, it, expect } from "vitest";
import { splitByPaidInventory } from "./orderSettlement";

describe("late payment inventory revalidation", () => {
  it("rejects a late payment when the last unit was already paid by another buyer", () => {
    expect(splitByPaidInventory([{ id: "a", listing_id: "l1", quantity: 1 }], { l1: 1 }, { l1: 1 }))
      .toEqual({ settle: [], reject: ["a"] });
  });
  it("settles when inventory is still available", () => {
    expect(splitByPaidInventory([{ id: "a", listing_id: "l1", quantity: 1 }], { l1: 2 }, { l1: 1 }))
      .toEqual({ settle: ["a"], reject: [] });
  });
  it("live auction orders without a listing always settle", () => {
    expect(splitByPaidInventory([{ id: "a", listing_id: null, quantity: 1 }], {}, {}).settle).toEqual(["a"]);
  });
  it("counts multiple orders in the same payment against each other", () => {
    expect(splitByPaidInventory([{ id: "a", listing_id: "l1", quantity: 1 }, { id: "b", listing_id: "l1", quantity: 1 }], { l1: 1 }, {}))
      .toEqual({ settle: ["a"], reject: ["b"] });
  });
});
