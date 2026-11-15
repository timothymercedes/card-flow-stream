/**
 * Confirms a Shippo rate was quoted for this order's shipment (seller origin →
 * buyer destination) before a label is purchased. Pure for unit testing.
 */
type Addr = { zip?: string | null; country?: string | null } | null | undefined;

const normZip = (z: unknown) => String(z ?? "").trim().toUpperCase().replace(/\s+/g, "").split("-")[0];
const normCountry = (c: unknown) => String(c ?? "US").trim().toUpperCase() || "US";

export function rateBoundToOrder(opts: {
  rateShipmentId: string | null | undefined;
  shipment: { object_id?: string | null; address_from?: Addr; address_to?: Addr } | null | undefined;
  order: { ship_zip?: string | null; ship_country?: string | null };
  seller: { address_zip?: string | null; address_country?: string | null } | null | undefined;
}): { ok: true } | { ok: false; reason: string } {
  const { rateShipmentId, shipment, order, seller } = opts;
  if (!rateShipmentId || !shipment || shipment.object_id !== rateShipmentId) return { ok: false, reason: "shipment_mismatch" };
  const to = shipment.address_to;
  const from = shipment.address_from;
  if (!to || !from) return { ok: false, reason: "address_missing" };
  if (!normZip(order.ship_zip) || normZip(to.zip) !== normZip(order.ship_zip)) return { ok: false, reason: "destination_mismatch" };
  if (normCountry(to.country) !== normCountry(order.ship_country)) return { ok: false, reason: "destination_mismatch" };
  if (!seller?.address_zip || normZip(from.zip) !== normZip(seller.address_zip)) return { ok: false, reason: "origin_mismatch" };
  if (normCountry(from.country) !== normCountry(seller.address_country)) return { ok: false, reason: "origin_mismatch" };
  return { ok: true };
}
