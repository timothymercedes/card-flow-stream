/**
 * Auction-win auto-charge (Phase 3 + 3.1 stabilization).
 *
 * Off-session PaymentIntent confirmation using the buyer's default saved
 * card. Called automatically when a buyer wins an auction so they never
 * leave the livestream to check out.
 *
 * Phase 3.1 fixes (do NOT regress):
 *  - 5% seller commission is included in `application_fee_amount` (was
 *    leaking revenue; sellers were receiving 100% of subtotal).
 *  - `commission_amount` and `seller_payout_amount` are persisted on every
 *    auto-charged order so payout dashboards stay correct.
 *  - `requires_action` is surfaced as `failed` to the UI so FixPaymentModal
 *    opens instead of silently parking the order in `processing` (off-session
 *    SCA challenges can't be completed without the buyer picking a new card).
 *  - `payment_failure_count` is incremented + `payment_failed_at` set so the
 *    cross-stream restriction thresholds in Phase 6 trigger correctly.
 *  - Failure path also stamps `payment_retry_deadline` (24h) for parity with
 *    the legacy webhook flow, so any pre-existing UI showing "retry within
 *    24h" continues to work.
 *
 * The fallback Stripe webhook at /api/public/stripe/webhook is INTACT and
 * remains the source of truth for reconciliation if this in-stream path
 * ever fails. Do not remove it.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  calculateFees,
  LIVE_BUYER_FEE_THRESHOLD,
  getStripe,
} from "@/lib/stripe.server";
import { quoteTax } from "@/lib/tax/taxProvider.server";

type ChargeResult =
  | { status: "paid"; paymentIntentId: string }
  | { status: "requires_action"; clientSecret: string; paymentIntentId: string }
  | { status: "failed"; message: string };

async function loadOrderForCharge(orderId: string, userId: string) {
  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select(
      "id,buyer_id,seller_id,amount,shipping_amount,title,payment_status,status,stream_id,stripe_payment_intent_id,commission_rate,payment_failure_count"
    )
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

async function markFailed(opts: {
  orderId: string;
  userId: string;
  prevFailureCount: number;
  message: string;
  title: string;
  streamId: string | null;
}) {
  const nowIso = new Date().toISOString();
  const retryDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await supabaseAdmin
    .from("orders")
    .update({
      payment_status: "failed",
      payment_failure_count: (opts.prevFailureCount || 0) + 1,
      payment_failed_at: nowIso,
      payment_retry_deadline: retryDeadline,
    })
    .eq("id", opts.orderId);

  // Insert/refresh a bid block so the buyer is restricted in this stream
  // until they pay or the host cancels.
  if (opts.streamId) {
    await supabaseAdmin
      .from("live_bid_blocks")
      .upsert(
        {
          stream_id: opts.streamId,
          user_id: opts.userId,
          reason: "payment_failed",
          expires_at: retryDeadline,
        },
        { onConflict: "stream_id,user_id" },
      );
  }

  await supabaseAdmin.from("notifications").insert({
    user_id: opts.userId,
    type: "payment_failed",
    body: `❗ Payment for "${opts.title}" failed (${opts.message}). Tap to fix.`,
    link: opts.streamId ? `/live/${opts.streamId}` : "/orders",
  });
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

  // Never charge a cancelled or refunded order — prevents firing a fresh
  // off-session charge against a buyer whose order was already closed out.
  if (order.status === "cancelled" || ["cancelled", "refunded"].includes(order.payment_status || "")) {
    return { status: "failed", message: "Order is cancelled or refunded — charge blocked." };
  }

  const pm = await loadDefaultPaymentMethod(userId, paymentMethodOverrideId);
  const seller = await loadSellerStripe(order.seller_id);

  // `orders.amount` is the buyer-facing item+shipping total; seller fees and
  // payout must be based on the item subtotal only. Shipping stays on the
  // platform side to buy labels / cover shipping margin.
  const orderTotalCents = Math.round(Number(order.amount) * 100);
  const shippingCents = Math.round(Number(order.shipping_amount || 0) * 100);
  const itemCents = Math.max(0, orderTotalCents - shippingCents);

  // Phase 11: buyer risk restrictions — block frozen/blocked accounts and
  // enforce admin-applied bid_limit (cents_limit).
  {
    const { data: canBuy } = await (supabaseAdmin.rpc as any)(
      "buyer_can_purchase",
      { _user_id: userId, _amount_cents: orderTotalCents },
    );
    if (canBuy === false) {
      await markFailed({
        orderId,
        userId,
        prevFailureCount: order.payment_failure_count ?? 0,
        message: "Account restricted",
        title: order.title,
        streamId: order.stream_id ?? null,
      });
      return { status: "failed", message: "Your account is currently restricted from bidding/purchases." };
    }
  }

  // Buyer country + state (intl fee + sales tax destination).
  const { data: buyerProfile } = await supabaseAdmin
    .from("profiles")
    .select("address_country,address_state")
    .eq("id", userId)
    .maybeSingle();
  const buyerCountry = ((buyerProfile as any)?.address_country || "US").toString().toUpperCase().trim();
  const buyerState = ((buyerProfile as any)?.address_state || "").toString().toUpperCase().trim() || null;
  const sellerCountry = (seller.country || "US").toString().toUpperCase().trim();
  const isInternational = buyerCountry !== sellerCountry && (buyerCountry !== "US" || sellerCountry !== "US");

  // Live fee threshold: buyer pays their processing half only for the first
  // few paid items in a stream. After that, seller absorbs buyer-side
  // processing too. Live auctions do not use the old flat $1.23 platform fee.
  let platformFeeOverride = 0;
  let feeIndex: number | null = null;
  if (order.stream_id) {
    const { count } = await supabaseAdmin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("buyer_id", userId)
      .eq("stream_id", order.stream_id)
      .eq("payment_status", "paid");
    feeIndex = (count || 0) + 1;
  }
  const feeSplitMode = order.stream_id && feeIndex != null && feeIndex > LIVE_BUYER_FEE_THRESHOLD
    ? "seller_absorbed"
    : "split";

  const commissionRate = Number(order.commission_rate ?? 0.05);
  const fees = calculateFees(itemCents, {
    isInternational,
    platformFeeCentsOverride: platformFeeOverride,
    sellerAbsorbedFeeCentsOverride: 0,
    commissionRate,
    feeSplitMode,
  });
  const feeAbsorbedBy: "buyer" | "seller" = fees.buyerProcessingFee > 0 ? "buyer" : "seller";
  const commissionCents = fees.commissionCents;
  const sellerPayoutCents = fees.sellerNet;

  // Tax — computed via swappable provider (state table today, Stripe Tax later).
  // Shipping is included in the auction amount on this path (order.amount
  // is the total bid; shipping is stored separately as shipping_amount).
  const tax = await quoteTax({ itemCents, shippingCents, buyerCountry, buyerState, sellerId: order.seller_id });
  const taxCents = tax.taxCents;

  // Tax flows on TOP of buyerTotal and into application_fee_amount —
  // platform collects it (marketplace facilitator) and remits separately.
  // Seller payout is unaffected by tax.
  const buyerChargeTotal = fees.buyerTotal + shippingCents + taxCents;
  const applicationFeeWithTax = fees.applicationFee + shippingCents + taxCents;

  const idemKey = `auction-charge:${orderId}:${buyerChargeTotal}:${pm.stripe_payment_method_id}`;

  try {
    const intent = await stripe.paymentIntents.create({
      amount: buyerChargeTotal,
      currency: "usd",
      customer: pm.stripe_customer_id,
      payment_method: pm.stripe_payment_method_id,
      off_session: true,
      confirm: true,
      application_fee_amount: applicationFeeWithTax,
      transfer_data: { destination: seller.stripe_account_id },
      metadata: {
        kind: "auction_auto_charge",
        order_id: orderId,
        buyer_id: userId,
        seller_id: order.seller_id,
        stream_id: order.stream_id ?? "",
        subtotal_cents: String(fees.subtotalCents),
        shipping_cents: String(shippingCents),
        platform_fee_cents: String(fees.platformFee),
        seller_absorbed_fee_cents: String(fees.sellerAbsorbedFee),
        commission_cents: String(commissionCents),
        processing_fee_cents: String(fees.processingFee),
        buyer_processing_fee_cents: String(fees.buyerProcessingFee),
        seller_processing_fee_cents: String(fees.sellerProcessingFee),
        fee_split_mode: fees.feeSplitMode,
        intl_fee_cents: String(fees.intlFee),
        seller_payout_cents: String(sellerPayoutCents),
        is_international: String(isInternational),
        buyer_country: buyerCountry,
        seller_country: sellerCountry,
        fee_index: feeIndex != null ? String(feeIndex) : "",
        fee_absorbed_by: feeAbsorbedBy,
        tax_cents: String(taxCents),
        taxable_subtotal_cents: String(tax.taxableSubtotalCents),
        tax_rate_bps: String(tax.taxRateBps),
        tax_jurisdiction: tax.jurisdiction ?? "",
        tax_provider: tax.provider,
      },
    }, { idempotencyKey: idemKey });

    await supabaseAdmin
      .from("orders")
      .update({
        stripe_payment_intent_id: intent.id,
        seller_stripe_account_id: seller.stripe_account_id,
        commission_amount: commissionCents / 100,
        seller_payout_amount: sellerPayoutCents / 100,
        final_charged_total_cents: buyerChargeTotal,
        platform_fee_cents: fees.platformFee,
        processing_fee_cents: fees.processingFee,
        buyer_processing_fee_cents: fees.buyerProcessingFee,
        seller_processing_fee_cents: fees.sellerProcessingFee,
        fee_split_mode: fees.feeSplitMode,
        fee_index: feeIndex,
        fee_absorbed_by: feeAbsorbedBy,
        tax_cents: taxCents,
        taxable_subtotal_cents: tax.taxableSubtotalCents,
        tax_rate_bps: tax.taxRateBps,
        tax_jurisdiction: tax.jurisdiction,
        tax_provider: tax.provider,
        tax_country: tax.country,
        tax_state: tax.state,
        tax_reconciliation_status: intent.status === "succeeded" ? "matched" : "pending",
        tax_reconciliation_details: {
          stripe_payment_intent_amount: buyerChargeTotal,
          item_cents: itemCents,
          shipping_cents: shippingCents,
          tax_cents: taxCents,
        },
        payment_status: intent.status === "succeeded" ? "paid" : "processing",
        paid_at: intent.status === "succeeded" ? new Date().toISOString() : null,
      })
      .eq("id", orderId);


    if (intent.status === "succeeded") {
      return { status: "paid", paymentIntentId: intent.id };
    }

    // Off-session 3DS / SCA can't be completed in the background — the
    // buyer needs to pick a different card. Surface as failed so the
    // in-stream FixPaymentModal opens.
    if (intent.status === "requires_action" && intent.client_secret) {
      await markFailed({
        orderId,
        userId,
        prevFailureCount: order.payment_failure_count ?? 0,
        message: "Your bank requires extra verification",
        title: order.title,
        streamId: order.stream_id ?? null,
      });
      return {
        status: "requires_action",
        clientSecret: intent.client_secret,
        paymentIntentId: intent.id,
      };
    }

    // Any other non-terminal status — treat as failed so buyer can retry.
    await markFailed({
      orderId,
      userId,
      prevFailureCount: order.payment_failure_count ?? 0,
      message: `Payment ${intent.status}`,
      title: order.title,
      streamId: order.stream_id ?? null,
    });
    return { status: "failed", message: `Payment ${intent.status}` };
  } catch (err: any) {
    // Stripe card errors include rich code/decline reason.
    const message: string =
      err?.raw?.message ??
      err?.message ??
      "Payment failed";

    await markFailed({
      orderId,
      userId,
      prevFailureCount: order.payment_failure_count ?? 0,
      message,
      title: order.title,
      streamId: order.stream_id ?? null,
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
