/**
 * Auction-win auto-charge (Phase 3).
 *
 * Off-session PaymentIntent confirmation using the buyer's default saved
 * card. Called automatically when a buyer wins an auction (the live page
 * detects the new `orders` row and invokes this server fn) so they never
 * leave the livestream to check out.
 *
 * On failure the order's payment_status is set to "failed" and the buyer
 * can recover via FixPaymentModal (saved card retry or new card).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  calculateFees,
  getStripe,
} from "@/lib/stripe.server";

type ChargeResult =
  | { status: "paid"; paymentIntentId: string }
  | { status: "requires_action"; clientSecret: string; paymentIntentId: string }
  | { status: "failed"; message: string };

async function loadOrderForCharge(orderId: string, userId: string) {
  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select("id,buyer_id,seller_id,amount,shipping_amount,title,payment_status,status,stream_id,stripe_payment_intent_id")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw error;
  if (!order) throw new Error("Order not found");
  if ((order as any).buyer_id !== userId) throw new Error("Not your order");
  return order as any;
}

async function loadDefaultPaymentMethod(userId: string, overrideId?: string) {
  if (overrideId) {
    const { data, error } = await supabaseAdmin
      .from("buyer_payment_methods" as any)
      .select("stripe_customer_id,stripe_payment_method_id")
      .eq("user_id", userId)
      .eq("id", overrideId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Payment method not found");
    return data as any;
  }
  const { data, error } = await supabaseAdmin
    .from("buyer_payment_methods" as any)
    .select("stripe_customer_id,stripe_payment_method_id")
    .eq("user_id", userId)
    .eq("is_default", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("No card on file");
  return data as any;
}

async function loadSellerStripe(sellerId: string) {
  const { data, error } = await supabaseAdmin
    .from("stripe_accounts")
    .select("stripe_account_id,charges_enabled,country")
    .eq("seller_id", sellerId)
    .maybeSingle();
  if (error) throw error;
  if (!data || !(data as any).charges_enabled) {
    throw new Error("Seller is not ready to accept payments");
  }
  return data as any;
}

async function performCharge(opts: {
  orderId: string;
  userId: string;
  paymentMethodOverrideId?: string;
}): Promise<ChargeResult> {
  const { orderId, userId, paymentMethodOverrideId } = opts;
  const stripe = getStripe();
  const order = await loadOrderForCharge(orderId, userId);

  // If already paid, no-op.
  if (order.payment_status === "paid") {
    return { status: "paid", paymentIntentId: order.stripe_payment_intent_id ?? "" };
  }

  const pm = await loadDefaultPaymentMethod(userId, paymentMethodOverrideId);
  const seller = await loadSellerStripe(order.seller_id);

  // amount and shipping_amount are stored as decimal dollars.
  const totalCents = Math.round(Number(order.amount) * 100);

  // Buyer country (for intl fee) and seller country for the international flag.
  const { data: buyerProfile } = await supabaseAdmin
    .from("profiles")
    .select("address_country")
    .eq("id", userId)
    .maybeSingle();
  const buyerCountry = ((buyerProfile as any)?.address_country || "US").toString().toUpperCase().trim();
  const sellerCountry = (seller.country || "US").toString().toUpperCase().trim();
  const isInternational = buyerCountry !== sellerCountry && (buyerCountry !== "US" || sellerCountry !== "US");

  const fees = calculateFees(totalCents, { isInternational });
  const idemKey = `auction-charge:${orderId}:${fees.buyerTotal}:${pm.stripe_payment_method_id}`;

  try {
    const intent = await stripe.paymentIntents.create({
      amount: fees.buyerTotal,
      currency: "usd",
      customer: pm.stripe_customer_id,
      payment_method: pm.stripe_payment_method_id,
      off_session: true,
      confirm: true,
      application_fee_amount: fees.applicationFee,
      transfer_data: { destination: seller.stripe_account_id },
      metadata: {
        kind: "auction_auto_charge",
        order_id: orderId,
        buyer_id: userId,
        seller_id: order.seller_id,
        stream_id: order.stream_id ?? "",
        subtotal_cents: String(fees.subtotalCents),
        platform_fee_cents: String(fees.platformFee),
        intl_fee_cents: String(fees.intlFee),
        is_international: String(isInternational),
      },
    }, { idempotencyKey: idemKey });

    // Persist regardless of final status so the webhook + UI can reconcile.
    await supabaseAdmin
      .from("orders")
      .update({
        stripe_payment_intent_id: intent.id,
        seller_stripe_account_id: seller.stripe_account_id,
        payment_status: intent.status === "succeeded" ? "paid" : "processing",
        paid_at: intent.status === "succeeded" ? new Date().toISOString() : null,
      })
      .eq("id", orderId);

    if (intent.status === "succeeded") {
      return { status: "paid", paymentIntentId: intent.id };
    }
    if (intent.status === "requires_action" && intent.client_secret) {
      return { status: "requires_action", clientSecret: intent.client_secret, paymentIntentId: intent.id };
    }
    // Any other non-terminal status — treat as failed so buyer can retry.
    await supabaseAdmin
      .from("orders")
      .update({ payment_status: "failed" })
      .eq("id", orderId);
    return { status: "failed", message: `Payment ${intent.status}` };
  } catch (err: any) {
    // Stripe card errors include rich code/decline reason.
    const message: string =
      err?.raw?.message ??
      err?.message ??
      "Payment failed";

    await supabaseAdmin
      .from("orders")
      .update({ payment_status: "failed" })
      .eq("id", orderId);

    await supabaseAdmin.from("notifications").insert({
      user_id: userId,
      type: "payment_failed",
      body: `❗ Payment for "${order.title}" failed (${message}). Tap to fix.`,
      link: order.stream_id ? `/live/${order.stream_id}` : "/orders",
    });

    return { status: "failed", message };
  }
}

export const chargeAuctionWinner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orderId: string }) => {
    if (!data?.orderId) throw new Error("orderId required");
    return data;
  })
  .handler(async ({ data, context }) => {
    return performCharge({ orderId: data.orderId, userId: context.userId });
  });

export const retryAuctionCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orderId: string; paymentMethodId?: string }) => {
    if (!data?.orderId) throw new Error("orderId required");
    return data;
  })
  .handler(async ({ data, context }) => {
    return performCharge({
      orderId: data.orderId,
      userId: context.userId,
      paymentMethodOverrideId: data.paymentMethodId,
    });
  });
