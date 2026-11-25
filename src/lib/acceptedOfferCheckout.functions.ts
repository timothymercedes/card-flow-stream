import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validateAcceptedOffer } from "./acceptedOfferOrder";

/**
 * Winning buyer of an accepted Marketplace offer gets (or reuses) one unpaid order at the
 * offer price. Payment then runs through the normal Marketplace checkout, so commission is
 * reserved by the shared row-locked allocator and confirmed only by verified payment.
 */
export const prepareAcceptedOfferOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ listingId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const userId = context.userId;
    const { data: listing } = await admin.from("listings")
      .select("id,seller_id,channel,closed_by,closed_winner_id,shipping_price,title,image_url")
      .eq("id", data.listingId).maybeSingle();
    const { data: offer } = await admin.from("offers")
      .select("id,buyer_id,status,amount,listing_id")
      .eq("listing_id", data.listingId).eq("buyer_id", userId).eq("status", "accepted")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    const check = validateAcceptedOffer({ offer, listing, callerId: userId });
    if (!check.ok) return { error: check.reason };

    const { data: existing } = await admin.from("orders")
      .select("id,payment_status").eq("listing_id", data.listingId).eq("buyer_id", userId)
      .in("payment_status", ["awaiting_payment", "paid"]).limit(1).maybeSingle();
    if (existing) return { orderId: existing.id as string, alreadyPaid: existing.payment_status === "paid" };

    const { data: p } = await admin.from("profiles")
      .select("full_name,username,address_line1,address_city,address_state,address_zip,address_country")
      .eq("id", userId).maybeSingle();
    if (!p?.address_line1 || !p?.address_city || !p?.address_zip) return { error: "Add your shipping address in Settings before paying" };
    const { data: order, error } = await admin.from("orders").insert({
      listing_id: listing.id, buyer_id: userId, seller_id: listing.seller_id,
      title: listing.title, item_image_url: listing.image_url,
      amount: check.amount + check.shipping, shipping_amount: check.shipping, quantity: 1,
      status: "pending", payment_status: "awaiting_payment",
      idempotency_key: `offer:${offer.id}`,
      ship_name: p.full_name || p.username || "", ship_address: p.address_line1, ship_city: p.address_city,
      ship_state: p.address_state || "", ship_zip: p.address_zip, ship_country: p.address_country || "US",
    }).select("id").single();
    if (error) return { error: error.message };
    return { orderId: order.id as string, alreadyPaid: false };
  });
