import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getStripe } from "@/lib/stripe.server";

const CancelOrderInput = z.object({
  orderId: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
});

async function isAdminOrOwner(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "owner"]);
  if (error) throw error;
  return (data ?? []).length > 0;
}

/**
 * Refund a paid order via Stripe.
 * - Pulls funds back from the connected seller account (reverse_transfer)
 * - Refunds the platform application fee proportionally
 * - Records refunded_amount + refunded_at on the order row
 * Throws if Stripe rejects the refund, so the cancel flow doesn't mark the
 * order cancelled while leaving the buyer charged.
 */
async function refundOrderIfPaid(order: any, reason?: string): Promise<string> {
  const current = (order.payment_status || "") as string;
  if (current === "refunded") return "refunded";
  if (["chargeback", "chargeback_lost", "disputed"].includes(current)) return current;

  const pi = order.stripe_payment_intent_id as string | undefined;
  if (!pi || current !== "paid") {
    return current === "paid" ? "paid" : "cancelled";
  }

  const stripe = getStripe();
  const refund = await stripe.refunds.create(
    {
      payment_intent: pi,
      reverse_transfer: true,
      refund_application_fee: true,
      reason: "requested_by_customer",
      metadata: {
        order_id: order.id,
        cancel_reason: (reason || "order_cancelled").slice(0, 200),
      },
    },
    { idempotencyKey: `refund:${order.id}` },
  );

  await supabaseAdmin
    .from("orders")
    .update({
      payment_status: "refunded",
      refunded_amount: Number(order.amount || 0) + Number(order.shipping_amount || 0),
      refunded_at: new Date().toISOString(),
      refunded_tax_cents: Number(order.tax_cents || 0),
    })
    .eq("id", order.id);

  try {
    await supabaseAdmin.from("platform_revenue").insert({
      kind: "sales_tax_refund",
      amount_cents: -Number(order.tax_cents || 0),
      order_id: order.id,
      stripe_refund_id: (refund as any).id,
    } as any);
  } catch {}

  return "refunded";
}

export const cancelOrderAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CancelOrderInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("id,title,buyer_id,seller_id,stream_id,status,payment_status,stripe_payment_intent_id,amount,shipping_amount,tax_cents")
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

    // Refund FIRST. If Stripe rejects, the throw bubbles up and the DB
    // stays untouched — buyer never sees "cancelled" while still charged.
    let paymentStatus: string;
    try {
      paymentStatus = await refundOrderIfPaid(order, data.reason);
    } catch (e: any) {
      throw new Error(`Refund failed: ${e?.message ?? "Stripe error"}`);
    }

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

    if (paymentStatus === "refunded") {
      try {
        await supabaseAdmin.from("notifications").insert({
          user_id: (order as any).buyer_id,
          type: "order",
          body: `Refund issued for "${(order as any).title}". Funds will return to your card in 5–10 business days.`,
          link: "/store",
        } as any);
      } catch {}
    }

    return { order: updated, refunded: paymentStatus === "refunded" };
  });

/**
 * Standalone refund — for cases where the order is already past cancel
 * (e.g. delivered → refund request). Same Stripe-first guarantees.
 */
const RefundOrderInput = z.object({
  orderId: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
});

export const refundOrderAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => RefundOrderInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("id,title,buyer_id,seller_id,stream_id,payment_status,stripe_payment_intent_id,amount,shipping_amount,tax_cents")
      .eq("id", data.orderId)
      .maybeSingle();
    if (error) throw error;
    if (!order) throw new Error("Order not found");

    const staff = await isAdminOrOwner(userId);
    const isSeller = (order as any).seller_id === userId;
    if (!staff && !isSeller) throw new Error("Only the seller, admin, or owner can refund this order");

    let status: string;
    try {
      status = await refundOrderIfPaid(order, data.reason);
    } catch (e: any) {
      return { refunded: false, reason: e?.message ?? "Refund failed" };
    }
    if (status !== "refunded") {
      return { refunded: false, reason: "This order has no successful payment to refund" };
    }

    if ((order as any).buyer_id) {
      try {
        await supabaseAdmin.from("notifications").insert({
          user_id: (order as any).buyer_id,
          type: "order",
          body: `Refund issued for "${(order as any).title}". Funds will return to your card in 5–10 business days.`,
          link: "/store",
        } as any);
      } catch {}
    }

    return { refunded: true };

  });
