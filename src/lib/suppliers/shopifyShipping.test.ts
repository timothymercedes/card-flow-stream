import { describe, expect, it } from "vitest";
import { parseDeferredShippingCents } from "./shopifySync.server";

const part = (o: unknown) => `\r\n--graphql\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(o)}`;
describe("Shopify shipping quote", () => {
  it("uses the cheapest option per package and adds packages together", () => {
    const body = part({ data: { cart: { id: "c" } }, hasNext: true }) + part({ incremental: [{ data: { deliveryGroups: { nodes: [
      { deliveryOptions: [{ estimatedCost: { amount: "12.45" } }, { estimatedCost: { amount: "20.00" } }] },
      { deliveryOptions: [{ estimatedCost: { amount: "5.10" } }] },
    ] } } }], hasNext: false }) + "\r\n--graphql--";
    expect(parseDeferredShippingCents(body)).toBe(1755);
  });
  it("returns null when Shopify gives no rate", () => {
    expect(parseDeferredShippingCents(part({ data: { cart: { id: "c" } }, hasNext: true }))).toBeNull();
  });
});
