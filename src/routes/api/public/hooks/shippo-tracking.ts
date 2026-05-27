// Shippo tracking webhook — receives scan/transit/delivery updates.
// Updates orders.shipping_status and releases payout-eligibility per lifecycle.
//
// Configure in Shippo: webhook URL = /api/public/hooks/shippo-tracking
// Event types: "track_updated"
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createHmac, timingSafeEqual } from "crypto";

type ShippoStatus = "UNKNOWN" | "PRE_TRANSIT" | "TRANSIT" | "DELIVERED" | "RETURNED" | "FAILURE";

function mapStatus(s: ShippoStatus, hasFirstScan: boolean): string | null {
  switch (s) {
    case "PRE_TRANSIT": return "label_created";
    case "TRANSIT": return hasFirstScan ? "in_transit" : "shipped";
    case "DELIVERED": return "delivered";
    case "RETURNED": return "returned";
    case "FAILURE": return "delivery_failed";
    default: return null;
  }
}

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.SHIPPO_WEBHOOK_SECRET;
  // Fail-closed: if no secret is configured, refuse all webhook requests.
  // This prevents anyone from injecting fake shipping events.
  if (!secret) {
    console.error("[shippo-tracking] SHIPPO_WEBHOOK_SECRET not configured — rejecting webhook");
    return false;
  }
  if (!signature) return false;
  try {
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch { return false; }
}

export const Route = createFileRoute("/api/public/hooks/shippo-tracking")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const sig = request.headers.get("x-shippo-signature") || request.headers.get("shippo-signature");
        if (!verifySignature(raw, sig)) {
          return new Response("invalid signature", { status: 401 });
        }
        let body: any;
        try { body = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }

        // Shippo payload shape: { event, data: { tracking_number, tracking_status: { status, status_details, location, status_date }, metadata } }
        const data = body?.data ?? body;
        const trackingNumber: string | undefined = data?.tracking_number;
        const status: ShippoStatus = (data?.tracking_status?.status || "UNKNOWN") as ShippoStatus;
        const statusDetails: string = data?.tracking_status?.status_details || "";
        const occurredAt: string = data?.tracking_status?.status_date || new Date().toISOString();
        const location: string = [data?.tracking_status?.location?.city, data?.tracking_status?.location?.state, data?.tracking_status?.location?.country].filter(Boolean).join(", ");
        const metadata: string | undefined = data?.metadata;

        if (!trackingNumber && !metadata) {
          return new Response("missing tracking", { status: 400 });
        }

        // Find order — prefer metadata (we set it = order.id), else tracking_number
        let orderId: string | null = null;
        if (metadata && /^[0-9a-f-]{36}$/i.test(metadata)) orderId = metadata;
        if (!orderId && trackingNumber) {
          const { data: o } = await supabaseAdmin
            .from("orders")
            .select("id, first_scan_at")
            .eq("tracking_number", trackingNumber)
            .maybeSingle();
          orderId = o?.id ?? null;
        }
        if (!orderId) {
          // Acknowledge to stop retries; nothing actionable.
          return new Response(JSON.stringify({ ok: true, ignored: "order not found" }), { status: 200 });
        }

        const { data: order } = await supabaseAdmin
          .from("orders").select("first_scan_at").eq("id", orderId).single();
        const mapped = mapStatus(status, !!order?.first_scan_at);

        if (mapped) {
          const { error } = await supabaseAdmin.rpc("set_order_shipping_status" as any, {
            _order_id: orderId,
            _status: mapped,
            _source: "shippo_webhook",
            _tracking_status: status,
            _location: location || null,
            _message: statusDetails || null,
            _raw: data,
          });
          if (error) console.error("[shippo-tracking] rpc error", error);
        } else {
          // Just log unknown events to the audit trail
          await supabaseAdmin.from("shipment_events").insert({
            order_id: orderId,
            source: "shippo_webhook",
            tracking_status: status,
            location: location || null,
            message: statusDetails || null,
            raw: data,
            occurred_at: occurredAt,
          } as any);
        }

        return new Response(JSON.stringify({ ok: true }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
