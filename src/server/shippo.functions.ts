import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEmail } from "./email.server";
import { sortRatesCheapestFirst, pickRecommendedRate } from "@/lib/shippingPresets";
import { z } from "zod";

const SHIPPO_BASE = "https://api.goshippo.com";

function shippoHeaders() {
  const key = process.env.SHIPPO_API_KEY;
  if (!key) throw new Error("SHIPPO_API_KEY not configured");
  return {
    Authorization: `ShippoToken ${key}`,
    "Content-Type": "application/json",
  };
}

async function shippo<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SHIPPO_BASE}${path}`, {
    ...init,
    headers: { ...shippoHeaders(), ...(init?.headers || {}) },
  });
  const text = await res.text();
  let data: any;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`Shippo ${res.status}: ${JSON.stringify(data).slice(0, 500)}`);
  return data as T;
}

const RatesInput = z.object({
  orderId: z.string().uuid(),
  weightOz: z.number().min(0.1).max(1500).default(4),
  lengthIn: z.number().min(1).max(108).default(7),
  widthIn: z.number().min(1).max(108).default(5),
  heightIn: z.number().min(0.1).max(108).default(0.5),
});

export const getShippoRates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => RatesInput.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("id, seller_id, ship_name, ship_address, ship_city, ship_state, ship_zip, ship_country")
      .eq("id", data.orderId)
      .single();
    if (error || !order) throw new Error("Order not found");
    if (order.seller_id !== userId) throw new Error("Only the seller can fetch rates");

    const { data: seller } = await supabaseAdmin
      .from("profiles")
      .select("full_name, address_line1, address_city, address_state, address_zip, address_country, phone")
      .eq("id", order.seller_id)
      .single();
    if (!seller?.address_line1 || !seller.address_zip) {
      throw new Error("Set your seller shipping address in your profile first");
    }

    const shipment = await shippo<any>("/shipments/", {
      method: "POST",
      body: JSON.stringify({
        address_from: {
          name: seller.full_name || "Seller",
          street1: seller.address_line1,
          city: seller.address_city,
          state: seller.address_state,
          zip: seller.address_zip,
          country: seller.address_country || "US",
          phone: seller.phone || "",
        },
        address_to: {
          name: order.ship_name,
          street1: order.ship_address,
          city: order.ship_city,
          state: order.ship_state,
          zip: order.ship_zip,
          country: order.ship_country || "US",
        },
        parcels: [{
          length: String(data.lengthIn),
          width: String(data.widthIn),
          height: String(data.heightIn),
          distance_unit: "in",
          weight: String(data.weightOz),
          mass_unit: "oz",
        }],
        async: false,
      }),
    });

    const rates = (shipment.rates || []).map((r: any) => ({
      objectId: r.object_id,
      provider: r.provider,
      service: r.servicelevel?.name,
      amount: r.amount,
      currency: r.currency,
      days: r.estimated_days,
    }));
    return { shipmentId: shipment.object_id, rates };
  });

const BuyInput = z.object({
  orderId: z.string().uuid(),
  rateId: z.string().min(1),
});

export const buyShippoLabel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => BuyInput.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("id, seller_id, buyer_id, title")
      .eq("id", data.orderId)
      .single();
    if (error || !order) throw new Error("Order not found");
    if (order.seller_id !== userId) throw new Error("Only the seller can buy a label");

    const tx = await shippo<any>("/transactions/", {
      method: "POST",
      body: JSON.stringify({ rate: data.rateId, label_file_type: "PDF", async: false }),
    });

    if (tx.status !== "SUCCESS") {
      throw new Error(`Label purchase failed: ${(tx.messages || []).map((m: any) => m.text).join(", ") || "unknown"}`);
    }

    await supabaseAdmin
      .from("orders")
      .update({
        tracking_number: tx.tracking_number,
        tracking_url: tx.tracking_url_provider,
        carrier: tx.rate?.provider || null,
        status: "shipped",
        shipped_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    // Notify buyer in-app
    await supabaseAdmin.from("notifications").insert({
      user_id: order.buyer_id,
      type: "order_shipped",
      body: `Your order "${order.title}" has shipped — tracking ${tx.tracking_number}`,
      link: "/orders",
    });

    // Email buyer (best-effort)
    try {
      const { data: buyer } = await supabaseAdmin.auth.admin.getUserById(order.buyer_id);
      const email = buyer?.user?.email;
      if (email) {
        const carrier = tx.rate?.provider || "carrier";
        await sendEmail({
          to: email,
          subject: `📦 Your order has shipped — ${order.title}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px">
            <h2>Your order is on its way!</h2>
            <p><strong>${order.title}</strong></p>
            <p>Carrier: ${carrier}<br/>Tracking: <strong>${tx.tracking_number}</strong></p>
            ${tx.tracking_url_provider ? `<p><a href="${tx.tracking_url_provider}" style="background:#7c3aed;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;display:inline-block">Track Package</a></p>` : ""}
            <p style="color:#666;font-size:12px">Thanks for shopping on PullBidLive.</p>
          </div>`,
        });
      }
    } catch (e) {
      console.error("Buyer email failed", e);
    }

    return {
      trackingNumber: tx.tracking_number,
      trackingUrl: tx.tracking_url_provider,
      labelUrl: tx.label_url,
      carrier: tx.rate?.provider,
    };
  });
