import { describe, it, expect } from "vitest";
import { allowedMethods, validateListingFulfillment, validateCheckoutMethod, isValidHandoffCode } from "./fulfillmentRules";
const ok = { verified: true, goodStanding: true };
describe("fulfillment rules", () => {
  it("PB Store is shipping only", () => {
    expect(allowedMethods("pb_store", "both")).toEqual(["shipping"]);
    expect(validateListingFulfillment("pb_store", "pickup", ok, "Miami")).not.toBeNull();
  });
  it("Bazaar rejects pickup", () => {
    expect(validateCheckoutMethod("bazaar", "both", "pickup")).not.toBeNull();
    expect(validateListingFulfillment("bazaar", "both", ok, "Miami")).not.toBeNull();
  });
  it("Marketplace honours seller choice", () => {
    expect(allowedMethods("marketplace", "both")).toEqual(["shipping", "pickup"]);
    expect(validateCheckoutMethod("marketplace", "shipping", "pickup")).not.toBeNull();
    expect(validateCheckoutMethod("marketplace", "pickup", "shipping")).not.toBeNull();
  });
  it("new listings default to shipping only", () => {
    expect(allowedMethods("marketplace")).toEqual(["shipping"]);
  });
  it("pickup requires verified seller in good standing", () => {
    expect(validateListingFulfillment("marketplace", "pickup", { verified: false, goodStanding: true }, "Miami")).not.toBeNull();
    expect(validateListingFulfillment("marketplace", "pickup", { verified: true, goodStanding: false }, "Miami")).not.toBeNull();
    expect(validateListingFulfillment("marketplace", "pickup", ok, "Miami, FL")).toBeNull();
  });
  it("pickup area must not be a street address", () => {
    expect(validateListingFulfillment("marketplace", "both", ok, "123 Main Street")).not.toBeNull();
    expect(validateListingFulfillment("marketplace", "both", ok, "33101")).toBeNull();
  });
  it("handoff code is 6 digits", () => {
    expect(isValidHandoffCode("123456")).toBe(true);
    expect(isValidHandoffCode("12345")).toBe(false);
  });
});
