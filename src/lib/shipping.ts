import { supabase } from "@/integrations/supabase/client";

export type PrepStatus =
  | "label_pending"
  | "label_created"
  | "prepared"
  | "packed"
  | "ready_for_dropoff"
  | "shipped"
  | "delivered";

export const PREP_LABEL: Record<PrepStatus, string> = {
  label_pending: "Label pending",
  label_created: "Label created",
  prepared: "Prepared",
  packed: "Packed",
  ready_for_dropoff: "Ready for dropoff",
  shipped: "Shipped",
  delivered: "Delivered",
};

export const PREP_ORDER: PrepStatus[] = [
  "label_pending", "label_created", "prepared", "packed", "ready_for_dropoff", "shipped", "delivered",
];

export type ScanResult = {
  order_id: string | null;
  prev_status: string | null;
  new_status: string | null;
  result: "matched" | "unmatched" | "mismatch" | string;
};

/** Mark an order as packed. Server-validated: caller must be the seller. */
export async function markOrderPacked(orderId: string) {
  const { data, error } = await (supabase.rpc as any)("mark_order_packed", { _order_id: orderId });
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data[0] : data);
}

/** Mark an order as ready for dropoff. */
export async function markOrderReady(orderId: string) {
  const { data, error } = await (supabase.rpc as any)("mark_order_ready", { _order_id: orderId });
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data[0] : data);
}

/** Register a scan against the seller's order list. */
export async function registerShippingScan(code: string, kind: "tracking" | "label" | "qr" = "tracking"): Promise<ScanResult> {
  const { data, error } = await (supabase.rpc as any)("register_shipping_scan", { _code: code, _kind: kind });
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data[0] : data) as ScanResult;
}
