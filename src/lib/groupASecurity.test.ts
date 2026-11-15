import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { checkOfferCaptureSettled } from "./offerSettlement";
import { rateBoundToOrder } from "./shippoRateBinding";
import { anonymousViewerAllowed, isValidStreamId } from "../../supabase/functions/_shared/viewerGate";

const src = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

describe("Finding 15: refresh-prices listing updates are scoped for non-admins", () => {
  const code = src("supabase/functions/refresh-prices/index.ts");
  it("adds a seller filter to the listings update when limited to a user", () => {
    expect(code).toMatch(/if \(limitToUserId\) listingUpdate = listingUpdate\.eq\("seller_id", limitToUserId\)/);
  });
  it("no longer has an unscoped awaited listings update by name", () => {
    expect(code).not.toMatch(/await supabase\s*\.from\("listings"\)\s*\.update\(update\)\s*\.eq\("name", id\.name\);/);
  });
});

describe("Finding 10: offers become paid only after settled capture", () => {
  const offer = { payment_intent_id: "pi_1", buyer_id: "b1", queue_item_id: "q1", amount: 25 };
  const good = { id: "pi_1", status: "succeeded", amount_received: 2500, currency: "usd", metadata: { kind: "queue_offer", buyer_id: "b1", queue_item_id: "q1" } };
  it("accepts a succeeded capture for the full amount", () => {
    expect(checkOfferCaptureSettled(good, offer)).toEqual({ ok: true });
  });
  it("rejects processing captures", () => {
    expect(checkOfferCaptureSettled({ ...good, status: "processing" }, offer).ok).toBe(false);
  });
  it("rejects short captures", () => {
    expect(checkOfferCaptureSettled({ ...good, amount_received: 2499 }, offer).ok).toBe(false);
  });
  it("rejects intents for another buyer", () => {
    expect(checkOfferCaptureSettled({ ...good, metadata: { ...good.metadata, buyer_id: "x" } }, offer).ok).toBe(false);
  });
  it("rejects a different intent id", () => {
    expect(checkOfferCaptureSettled({ ...good, id: "pi_2" }, offer).ok).toBe(false);
  });
  it("acceptOffer checks settlement before inserting the paid order", () => {
    const code = src("src/lib/offers.functions.ts");
    expect(code.indexOf("checkOfferCaptureSettled(captured, o)")).toBeGreaterThan(-1);
    expect(code.indexOf("checkOfferCaptureSettled(captured, o)")).toBeLessThan(code.indexOf('payment_status: "paid"'));
  });
});

describe("Finding 16: Shippo rate must belong to the order", () => {
  const base = {
    rateShipmentId: "shp_1",
    shipment: { object_id: "shp_1", address_from: { zip: "10001", country: "US" }, address_to: { zip: "90210-1234", country: "US" } },
    order: { ship_zip: "90210", ship_country: "US" },
    seller: { address_zip: "10001", address_country: "US" },
  };
  it("accepts a rate quoted seller → buyer", () => expect(rateBoundToOrder(base).ok).toBe(true));
  it("rejects a different destination", () =>
    expect(rateBoundToOrder({ ...base, shipment: { ...base.shipment, address_to: { zip: "33101", country: "US" } } }).ok).toBe(false));
  it("rejects a different origin", () =>
    expect(rateBoundToOrder({ ...base, shipment: { ...base.shipment, address_from: { zip: "60601", country: "US" } } }).ok).toBe(false));
  it("rejects international destination swap", () =>
    expect(rateBoundToOrder({ ...base, shipment: { ...base.shipment, address_to: { zip: "90210", country: "GB" } } }).ok).toBe(false));
  it("rejects shipment id mismatch", () => expect(rateBoundToOrder({ ...base, rateShipmentId: "shp_2" }).ok).toBe(false));
  it("buyShippoLabel validates the rate before the transaction call", () => {
    const code = src("src/lib/shippo.functions.ts");
    expect(code.indexOf("rateBoundToOrder({")).toBeGreaterThan(-1);
    expect(code.indexOf("rateBoundToOrder({")).toBeLessThan(code.indexOf('shippo<any>("/transactions/"'));
  });
});

describe("Finding 12: anonymous Cloudflare sessions need a live show", () => {
  const live = "7f1c2a3b-1111-4222-8333-944455556666";
  it("allows a live stream", async () => {
    expect(await anonymousViewerAllowed(live, async () => ({ status: "live" }))).toBe(true);
  });
  it("refuses missing / malformed ids without a lookup", async () => {
    const lookup = vi.fn();
    expect(await anonymousViewerAllowed(null, lookup)).toBe(false);
    expect(await anonymousViewerAllowed("abc", lookup)).toBe(false);
    expect(lookup).not.toHaveBeenCalled();
  });
  it("refuses ended or unknown streams and lookup errors", async () => {
    expect(await anonymousViewerAllowed(live, async () => ({ status: "ended", is_active: false }))).toBe(false);
    expect(await anonymousViewerAllowed(live, async () => null)).toBe(false);
    expect(await anonymousViewerAllowed(live, async () => { throw new Error("x"); })).toBe(false);
  });
  it("validates uuid shape", () => expect(isValidStreamId(live)).toBe(true));
  it("proxy gates public viewer requests before forwarding", () => {
    const code = src("supabase/functions/cf-calls/index.ts");
    expect(code.indexOf("anonymousViewerAllowed(")).toBeLessThan(code.indexOf("fetch(`${config.base}${path}`"));
  });
});

describe("Finding 1: Missing Card Finder respects Vault privacy", () => {
  it("reads other collectors' vault cards through the caller-scoped client", () => {
    const code = src("src/lib/collection.functions.ts");
    const fn = code.slice(code.indexOf("export const getMissingCardFinder"), code.indexOf("Collection Goals"));
    expect(fn).toMatch(/context\.supabase\s*\.from\("vault_cards"\)/);
    expect(fn).not.toMatch(/supabaseAdmin\s*\.from\("vault_cards"\)/);
  });
});
