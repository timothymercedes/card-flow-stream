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
  // Defaults sized for a single TCG card in a PWE — never assume a 1lb+ box.
  weightOz: z.number().min(0.1).max(1500).default(1),
  lengthIn: z.number().min(1).max(108).default(6),
  widthIn: z.number().min(1).max(108).default(4),
  heightIn: z.number().min(0.1).max(108).default(0.1),
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

    const rawRates = (shipment.rates || []).map((r: any) => ({
      objectId: r.object_id,
      provider: r.provider,
      service: r.servicelevel?.name,
      amount: r.amount,
      currency: r.currency,
      days: r.estimated_days,
    }));
    const rates = sortRatesCheapestFirst(rawRates);
    const recommended = pickRecommendedRate(rates) as any;
    return { shipmentId: shipment.object_id, rates, recommendedRateId: recommended?.objectId ?? null };
  });

// =====================================================================
// Pre-purchase rate estimate — quotes carrier rates without an order row.
// Used by listing pages, cart, live auction, and seller preview to auto-
// populate the shipping line instead of asking sellers to type it in.
// =====================================================================

const PRESET_PARCEL: Record<string, { weightOz: number; lengthIn: number; widthIn: number; heightIn: number; flatPriceUsd?: number; flatRate?: boolean }> = {
  stamp: { weightOz: 1, lengthIn: 6, widthIn: 4, heightIn: 0.05, flatPriceUsd: 0.78, flatRate: true },
  pwe: { weightOz: 1, lengthIn: 6, widthIn: 4, heightIn: 0.1, flatPriceUsd: 0.99, flatRate: true },
  bubble: { weightOz: 4, lengthIn: 7, widthIn: 5, heightIn: 1 },
  small_box: { weightOz: 10, lengthIn: 8, widthIn: 6, heightIn: 4 },
};

const EstimateInput = z.object({
  sellerId: z.string().uuid(),
  presetKey: z.enum(["stamp", "pwe", "bubble", "small_box"]).optional(),
  weightOz: z.number().min(0.1).max(1500).optional(),
  lengthIn: z.number().min(1).max(108).optional(),
  widthIn: z.number().min(1).max(108).optional(),
  heightIn: z.number().min(0.1).max(108).optional(),
  buyerCountry: z.string().length(2).optional(),
  buyerZip: z.string().min(2).max(16).optional(),
});

export const estimateShippoRates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => EstimateInput.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const preset = data.presetKey ? PRESET_PARCEL[data.presetKey] : PRESET_PARCEL.bubble;
    const weightOz = data.weightOz ?? preset.weightOz;
    const lengthIn = data.lengthIn ?? preset.lengthIn;
    const widthIn = data.widthIn ?? preset.widthIn;
    const heightIn = data.heightIn ?? preset.heightIn;

    // Resolve seller address
    const { data: seller } = await supabaseAdmin
      .from("profiles")
      .select("full_name, address_line1, address_city, address_state, address_zip, address_country")
      .eq("id", data.sellerId)
      .single();

    const sellerCountry = (seller?.address_country || "US").toUpperCase();

    // Resolve buyer destination — explicit override > buyer profile > seller country (domestic estimate)
    let buyerCountry = (data.buyerCountry || "").toUpperCase();
    let buyerZip = data.buyerZip || "";
    if (!buyerCountry) {
      const { data: buyer } = await supabaseAdmin
        .from("profiles")
        .select("address_country, address_zip")
        .eq("id", userId)
        .single();
      buyerCountry = (buyer?.address_country || sellerCountry).toUpperCase();
      if (!buyerZip) buyerZip = buyer?.address_zip || "";
    }
    const isInternational = buyerCountry !== sellerCountry;

    // Flat-rate untracked presets — don't hit Shippo at all
    if (preset.flatRate && !isInternational) {
      return {
        amountUsd: preset.flatPriceUsd ?? 0.99,
        currency: "USD",
        carrier: "USPS",
        service: data.presetKey === "stamp" ? "Letter (stamp)" : "PWE",
        isInternational: false,
        source: "flat" as const,
        message: "Flat-rate untracked",
      };
    }

    // Fallback when seller hasn't set their address — use offline estimate
    if (!seller?.address_zip || !seller.address_line1) {
      const oz = weightOz;
      const shipping = isInternational
        ? 15.5 + Math.max(0, oz - 4) * 0.85
        : oz <= 2 ? 0.99 : 4.75 + Math.max(0, oz - 4) * 0.35;
      return {
        amountUsd: shipping,
        currency: "USD",
        isInternational,
        source: "fallback" as const,
        message: "Seller hasn't set a return address yet",
      };
    }

    try {
      const shipment = await shippo<any>("/shipments/", {
        method: "POST",
        body: JSON.stringify({
          address_from: {
            name: seller.full_name || "Seller",
            street1: seller.address_line1,
            city: seller.address_city,
            state: seller.address_state,
            zip: seller.address_zip,
            country: sellerCountry,
          },
          address_to: {
            name: "Buyer",
            street1: "—",
            city: buyerCountry === "US" ? "New York" : "London",
            state: buyerCountry === "US" ? "NY" : "",
            zip: buyerZip || (buyerCountry === "US" ? "10001" : "SW1A1AA"),
            country: buyerCountry,
          },
          parcels: [{
            length: String(lengthIn),
            width: String(widthIn),
            height: String(heightIn),
            distance_unit: "in",
            weight: String(weightOz),
            mass_unit: "oz",
          }],
          async: false,
        }),
      });

      const rates = (shipment.rates || []).map((r: any) => ({
        provider: r.provider,
        service: r.servicelevel?.name,
        amount: Number(r.amount),
      })).filter((r: any) => r.amount > 0).sort((a: any, b: any) => a.amount - b.amount);

      if (rates.length === 0) {
        // No carrier rates returned — fall back
        const oz = weightOz;
        const shipping = isInternational
          ? 15.5 + Math.max(0, oz - 4) * 0.85
          : oz <= 2 ? 0.99 : 4.75 + Math.max(0, oz - 4) * 0.35;
        return { amountUsd: shipping, currency: "USD", isInternational, source: "fallback" as const, message: "No carrier rates returned" };
      }

      const cheapest = rates[0];
      return {
        amountUsd: cheapest.amount,
        currency: "USD",
        carrier: cheapest.provider,
        service: cheapest.service,
        isInternational,
        source: "shippo" as const,
      };
    } catch (e: any) {
      const oz = weightOz;
      const shipping = isInternational
        ? 15.5 + Math.max(0, oz - 4) * 0.85
        : oz <= 2 ? 0.99 : 4.75 + Math.max(0, oz - 4) * 0.35;
      return {
        amountUsd: shipping,
        currency: "USD",
        isInternational,
        source: "fallback" as const,
        message: e?.message?.slice(0, 200) || "Carrier API unavailable",
      };
    }
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
