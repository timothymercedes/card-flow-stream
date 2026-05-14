/**
 * Pre-B queue actions: Buy Now (creates an awaiting_payment order so it
 * shows up in cart + items-to-ship after pay), and Make Offer (writes a
 * pending row to queue_offers for the host to review).
 *
 * Both run as the authenticated user (RLS-respecting).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const buyNowQueueItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ queueItemId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Lock-fetch item via RLS (host_id is public, full row readable)
    const { data: item, error: itemErr } = await supabase
      .from("auction_queue")
      .select("*")
      .eq("id", data.queueItemId)
      .maybeSingle();
    if (itemErr) throw new Error(itemErr.message);
    if (!item) throw new Error("Item not found");
    if (item.sold_to) throw new Error("Item already sold");
    if (item.host_id === userId) throw new Error("You can't buy your own item");

    const price = Number((item as any).buy_now_price ?? item.snipe_price ?? 0);
    if (!price || price <= 0) throw new Error("This item has no Buy Now price");

    // Buyer profile (for username on receipt)
    const { data: buyer } = await supabase.from("profiles").select("username").eq("id", userId).maybeSingle();

    // Create awaiting_payment order — buyer fills shipping at checkout
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        buyer_id: userId,
        seller_id: item.host_id,
        title: item.title,
        amount: price,
        quantity: 1,
        item_image_url: item.image_url,
        stream_id: item.stream_id,
        payment_status: "awaiting_payment",
        status: "pending",
        // placeholders — buyer will fill at checkout
        ship_address: "",
        ship_city: "",
        ship_zip: "",
        ship_name: (buyer as any)?.username || "",
        ship_country: "US",
      } as any)
      .select("id")
      .single();
    if (orderErr) throw new Error(orderErr.message);

    // Mark queue item sold
    const { error: updateErr } = await supabase
      .from("auction_queue")
      .update({
        sold_to: userId,
        sold_at: new Date().toISOString(),
        order_id: (order as any).id,
        status: "sold",
      } as any)
      .eq("id", item.id)
      .is("sold_to", null);
    if (updateErr) throw new Error(updateErr.message);

    return { orderId: (order as any).id };
  });

export const makeQueueOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      queueItemId: z.string().uuid(),
      amount: z.number().positive().max(1_000_000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: item } = await supabase
      .from("auction_queue")
      .select("id, host_id, sold_to, min_offer")
      .eq("id", data.queueItemId)
      .maybeSingle();
    if (!item) throw new Error("Item not found");
    if ((item as any).sold_to) throw new Error("Item already sold");
    if (item.host_id === userId) throw new Error("You can't offer on your own item");

    const min = Number((item as any).min_offer || 0);
    if (min > 0 && data.amount < min) throw new Error(`Minimum offer is $${min}`);

    const { data: buyer } = await supabase.from("profiles").select("username").eq("id", userId).maybeSingle();

    const { error } = await supabase.from("queue_offers" as any).insert({
      queue_item_id: data.queueItemId,
      buyer_id: userId,
      buyer_username: (buyer as any)?.username || null,
      amount: data.amount,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const acceptQueueOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ offerId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: offer } = await supabase
      .from("queue_offers" as any)
      .select("*, auction_queue!inner(host_id, title, image_url, stream_id, sold_to)")
      .eq("id", data.offerId)
      .maybeSingle();
    if (!offer) throw new Error("Offer not found");
    const aq: any = (offer as any).auction_queue;
    if (aq.host_id !== userId) throw new Error("Only the host can accept offers");
    if (aq.sold_to) throw new Error("Item already sold");

    // Mark offer accepted
    await supabase.from("queue_offers" as any).update({ status: "accepted", updated_at: new Date().toISOString() }).eq("id", data.offerId);
    // Decline siblings
    await supabase.from("queue_offers" as any)
      .update({ status: "declined", updated_at: new Date().toISOString() })
      .eq("queue_item_id", (offer as any).queue_item_id)
      .neq("id", data.offerId)
      .eq("status", "pending");

    return { ok: true, buyerId: (offer as any).buyer_id, amount: (offer as any).amount };
  });
