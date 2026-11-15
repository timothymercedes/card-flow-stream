import { describe, expect, it } from "vitest";
import { catalogRange, draftBulkStatus } from "./bazaarCatalog";

describe("large hidden Bazaar catalog", () => {
  it("can address products beyond 1000 with bounded pages", () => {
    expect(catalogRange(41)).toEqual([1000, 1024]);
    expect(catalogRange(401)).toEqual([10000, 10024]);
  });
  it("bulk draft actions cannot publish or activate private test products", () => {
    expect(Object.values(draftBulkStatus)).toEqual(["draft", "paused"]);
  });
});