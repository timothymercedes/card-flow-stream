import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CancelOrderInput = z.object({
  orderId: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
});

function cancelledPaymentStatus(current: string | null | undefined) {
  if (["paid", "refunded", "disputed", "chargeback", "chargeback_lost"].includes(current || "")) {
    return current || "paid";
  }
  return "cancelled";
}

async function isAdminOrOwner(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "owner"]);
  if (error) throw error;
  return (data ?? []).length > 0;
}

export const cancelOrderAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CancelOrderInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("id,title,buyer_id,seller_id,stream_id,status,payment_status")
      .eq("id", data.orderId)
      .maybeSingle();
    if (error) throw error;
    if (!order) throw new Error("Order not found");

    const staff = await isAdminOrOwner(userId);
    let canCancel = staff || (order as any).seller_id === userId;

    if (!canCancel && (order as any).stream_id) {
      const { data: stream } = await supabaseAdmin
        .from("live_streams")
        .select("seller_id")
        .eq("id", (order as any).stream_id)
        .maybeSingle();
      canCancel = (stream as any)?.seller_id === userId;
    }

    if (!canCancel) throw new Error("Only the seller, host, admin, or owner can cancel this order");

    const paymentStatus = cancelledPaymentStatus((order as any).payment_status);
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("orders")
      .update({ status: "cancelled", payment_status: paymentStatus })
      .eq("id", data.orderId)
      .select("id,status,payment_status")
      .single();
    if (updateError) throw updateError;

    if ((order as any).stream_id) {
      await supabaseAdmin
        .from("live_bid_blocks")
        .delete()
        .eq("stream_id", (order as any).stream_id)
        .eq("user_id", (order as any).buyer_id);
    }

    if ((order as any).buyer_id !== userId) {
      await supabaseAdmin.from("notifications").insert({
        user_id: (order as any).buyer_id,
        sender_id: userId,
        type: "order_cancel",
        body: `Order cancelled: \"${(order as any).title}\"${data.reason ? ` — ${data.reason}` : ""}`,
        link: (order as any).stream_id ? `/live/${(order as any).stream_id}` : "/orders",
      });
    }

    return { order: updated };
  });