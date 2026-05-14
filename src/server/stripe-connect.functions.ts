import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createClient } from "@supabase/supabase-js";
import { getStripe, calculateFees, calculateTipFees, promotionDurationSeconds } from "@/lib/stripe.server";
import type { Database } from "@/integrations/supabase/types";

async function getOptionalUserIdFromRequest() {
  try {
    const request = getRequest();
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!token || !url || !key) return null;

    const supabase = createClient<Database>(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.getClaims(token);
    return error ? null : (data?.claims?.sub ?? null);
  } catch (error) {
    console.error("Optional Connect status auth failed", error);
    return null;
  }
}

export const getStripePublishableKey = createServerFn({ method: "GET" }).handler(async () => {
  const key = process.env.STRIPE_PUBLISHABLE_KEY;
  if (!key) throw new Error("STRIPE_PUBLISHABLE_KEY not configured");
  return { publishableKey: key };
});

/**
 * Create or retrieve a Stripe Express account for the seller and return an onboarding link.
 */
export const createConnectOnboardingLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { returnUrl: string; refreshUrl: string }) => {
    if (!data.returnUrl || !data.refreshUrl) throw new Error("Missing URLs");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const stripe = getStripe();

    // Look up existing account
    const { data: existing } = await supabaseAdmin
      .from("stripe_accounts")
      .select("stripe_account_id")
      .eq("seller_id", userId)
      .maybeSingle();

    let stripeAccountId = (existing as any)?.stripe_account_id as string | undefined;

    if (!stripeAccountId) {
      // Get email from auth
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
      const email = userData.user?.email;

      const account = await stripe.accounts.create({
        type: "express",
        email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: { seller_id: userId },
      });
      stripeAccountId = account.id;

      await supabaseAdmin.from("stripe_accounts").insert({
        seller_id: userId,
        stripe_account_id: stripeAccountId,
      });
    }

    const link = await stripe.accountLinks.create({
      account: stripeAccountId,
      return_url: data.returnUrl,
      refresh_url: data.refreshUrl,
      type: "account_onboarding",
    });

    return { url: link.url, stripeAccountId };
  });

/**
 * Sync the seller's Stripe account status (charges_enabled, payouts_enabled, details_submitted).
 */
export const syncConnectAccountStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const stripe = getStripe();

    const { data: row } = await supabaseAdmin
      .from("stripe_accounts")
      .select("stripe_account_id")
      .eq("seller_id", userId)
      .maybeSingle();

    if (!row) return { connected: false };

    const account = await stripe.accounts.retrieve((row as any).stripe_account_id);

    await supabaseAdmin
      .from("stripe_accounts")
      .update({
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
        country: account.country,
        default_currency: account.default_currency,
      })
      .eq("seller_id", userId);

    return {
      connected: true,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
    };
  });

/**
 * Get the seller's current Connect status from our database.
 */
export const getMyConnectStatus = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await getOptionalUserIdFromRequest();
  if (!userId) return null;

  try {
    const { data, error } = await supabaseAdmin
      .from("stripe_accounts")
      .select("stripe_account_id, charges_enabled, payouts_enabled, details_submitted, deliveries_count")
      .eq("seller_id", userId)
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  } catch (error) {
    console.error("getMyConnectStatus failed", error);
    return null;
  }
});

/**
 * Create a marketplace PaymentIntent for a buyer purchasing from a seller.
 * Splits Stripe processing fees ~50/50 via a buyer service fee, takes 5% platform fee.
 */
export const createMarketplacePaymentIntent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { sellerId: string; subtotalCents?: number; orderId?: string; orderIds?: string[] }) => {
    if (!data.sellerId) throw new Error("sellerId required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const stripe = getStripe();

    const { data: sellerAcct } = await supabaseAdmin
      .from("stripe_accounts")
      .select("stripe_account_id, charges_enabled")
      .eq("seller_id", data.sellerId)
      .maybeSingle();

    if (!sellerAcct || !(sellerAcct as any).charges_enabled) {
      throw new Error("Seller is not ready to accept payments");
    }

    const orderIds = data.orderIds && data.orderIds.length > 0
      ? data.orderIds
      : (data.orderId ? [data.orderId] : []);
    if (orderIds.length === 0) throw new Error("No orders to pay");

    // Authoritative: fetch the buyer's unpaid orders for this seller from DB.
    const { data: orderRows, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select("id, amount, buyer_id, seller_id, payment_status, listing_id")
      .in("id", orderIds);
    if (orderErr) throw new Error(orderErr.message);
    if (!orderRows || orderRows.length !== orderIds.length) {
      throw new Error("Order(s) not found");
    }
    for (const o of orderRows as any[]) {
      if (o.buyer_id !== userId) throw new Error("Order does not belong to you");
      if (o.seller_id !== data.sellerId) throw new Error("Order seller mismatch");
      if (o.payment_status !== "awaiting_payment") throw new Error("Order already paid");
    }
    const subtotalCents = (orderRows as any[]).reduce(
      (a, o) => a + Math.round(Number(o.amount) * 100),
      0,
    );
    if (subtotalCents < 50) throw new Error("Amount too low");

    // International detection: compare buyer's profile country with the
    // seller's Stripe Connect account country. If either is outside the
    // USA, apply the 4% international processing fee.
    const { data: buyerProfile } = await supabaseAdmin
      .from("profiles")
      .select("address_country")
      .eq("id", userId)
      .maybeSingle();
    const buyerCountry = ((buyerProfile as any)?.address_country || "US")
      .toString().toUpperCase().trim();
    const sellerCountry = ((sellerAcct as any).country || "US")
      .toString().toUpperCase().trim();
    const isInternational = buyerCountry !== sellerCountry &&
      (buyerCountry !== "US" || sellerCountry !== "US");

    // Enforce per-listing blocked_countries against the buyer's country.
    if (isInternational) {
      const orderListingIds = (orderRows as any[])
        .map((o) => o.listing_id).filter(Boolean);
      if (orderListingIds.length > 0) {
        const { data: listings } = await supabaseAdmin
          .from("listings")
          .select("id, blocked_countries, ships_internationally")
          .in("id", orderListingIds);
        for (const l of (listings as any[]) || []) {
          if (l.ships_internationally === false) {
            throw new Error("Seller does not ship this item internationally");
          }
          const blocked = (l.blocked_countries as string[] | null) || [];
          if (blocked.map((c) => c.toUpperCase()).includes(buyerCountry)) {
            throw new Error(`Seller does not ship to ${buyerCountry}`);
          }
        }
      }
    }

    const fees = calculateFees(subtotalCents, { isInternational });

    // Idempotency key bound to (buyer, sorted order ids, amount) — safe to retry.
    const idemKey = `pi:${userId}:${[...orderIds].sort().join(",")}:${fees.buyerTotal}`;

    const intent = await stripe.paymentIntents.create({
      amount: fees.buyerTotal,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      application_fee_amount: fees.applicationFee,
      transfer_data: { destination: (sellerAcct as any).stripe_account_id },
      metadata: {
        buyer_id: userId,
        seller_id: data.sellerId,
        order_id: orderIds[0] ?? "",
        order_ids: orderIds.join(","),
        subtotal_cents: String(fees.subtotalCents),
        platform_fee_cents: String(fees.platformFee),
        intl_fee_cents: String(fees.intlFee),
        is_international: String(isInternational),
        buyer_country: buyerCountry,
        seller_country: sellerCountry,
        buyer_service_fee_cents: String(fees.buyerServiceFee),
      },
    }, { idempotencyKey: idemKey });

    // Stamp the PI on every order in this group so the webhook can reconcile
    // and refunds can be applied later.
    await supabaseAdmin
      .from("orders")
      .update({
        stripe_payment_intent_id: intent.id,
        seller_stripe_account_id: (sellerAcct as any).stripe_account_id,
        idempotency_key: idemKey,
      })
      .in("id", orderIds);

    return {
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      ...fees,
    };
  });

/**
 * Create a PaymentIntent for a viewer tip on a live stream.
 * Buyer pays subtotal + service fee; platform takes 5%; rest goes to streamer via Connect.
 */
export const createStreamTipPaymentIntent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { streamId: string; amountCents: number; message?: string }) => {
    if (!data.streamId) throw new Error("streamId required");
    if (!Number.isFinite(data.amountCents) || data.amountCents < 200) {
      throw new Error("Minimum tip is $2");
    }
    if (data.amountCents > 50000) throw new Error("Maximum tip is $500");
    if (data.message && data.message.length > 200) throw new Error("Message too long");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const stripe = getStripe();

    const { data: stream } = await supabaseAdmin
      .from("live_streams")
      .select("seller_id")
      .eq("id", data.streamId)
      .maybeSingle();
    if (!stream) throw new Error("Stream not found");
    const sellerId = (stream as any).seller_id as string;
    if (sellerId === userId) throw new Error("You can't tip yourself");

    const { data: sellerAcct } = await supabaseAdmin
      .from("stripe_accounts")
      .select("stripe_account_id, charges_enabled")
      .eq("seller_id", sellerId)
      .maybeSingle();
    if (!sellerAcct || !(sellerAcct as any).charges_enabled) {
      throw new Error("Streamer is not ready to accept tips");
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("username")
      .eq("id", userId)
      .maybeSingle();
    const buyerUsername = (profile as any)?.username ?? "viewer";

    const fees = calculateTipFees(data.amountCents);

    // Insert pending tip row with computed platform fee + streamer payout.
    const { data: tipRow, error: tipErr } = await supabaseAdmin
      .from("stream_tips")
      .insert({
        stream_id: data.streamId,
        seller_id: sellerId,
        buyer_id: userId,
        buyer_username: buyerUsername,
        amount: data.amountCents / 100,
        platform_fee: fees.platformFee / 100,
        streamer_payout: fees.streamerPayout / 100,
        message: data.message || null,
        status: "pending",
      })
      .select("id")
      .single();
    if (tipErr || !tipRow) throw new Error(tipErr?.message ?? "Failed to record tip");

    const intent = await stripe.paymentIntents.create({
      amount: fees.buyerTotal,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      application_fee_amount: fees.platformFee,
      transfer_data: { destination: (sellerAcct as any).stripe_account_id },
      metadata: {
        kind: "stream_tip",
        tip_id: (tipRow as any).id,
        stream_id: data.streamId,
        buyer_id: userId,
        seller_id: sellerId,
        buyer_username: buyerUsername,
        tip_amount_cents: String(data.amountCents),
        platform_fee_cents: String(fees.platformFee),
        streamer_payout_cents: String(fees.streamerPayout),
      },
    });

    await supabaseAdmin
      .from("stream_tips")
      .update({ stripe_payment_intent_id: intent.id })
      .eq("id", (tipRow as any).id);

    return {
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      tipId: (tipRow as any).id,
      ...fees,
    };
  });

/**
 * Create a PaymentIntent for a viewer "promotion" — pays to boost a live
 * stream's discoverability. Same Connect split as tips, but recorded in
 * stream_promotions and (on webhook) increments the stream's promotion_score.
 *
 * Anti-spam: 30s cooldown per (user, stream) on pending+paid promotions.
 */
export const createStreamPromotionPaymentIntent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { streamId: string; amountCents: number; message?: string }) => {
    if (!data.streamId) throw new Error("streamId required");
    if (!Number.isFinite(data.amountCents) || data.amountCents < 100) {
      throw new Error("Minimum promotion is $1");
    }
    if (data.amountCents > 50000) throw new Error("Maximum promotion is $500");
    if (data.message && data.message.length > 140) throw new Error("Message too long");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const stripe = getStripe();

    const { data: stream } = await supabaseAdmin
      .from("live_streams")
      .select("seller_id, promotions_enabled, promotion_min_amount")
      .eq("id", data.streamId)
      .maybeSingle();
    if (!stream) throw new Error("Stream not found");
    const s = stream as any;
    if (s.promotions_enabled === false) throw new Error("Host has disabled promotions");
    const minCents = Math.round(Number(s.promotion_min_amount || 1) * 100);
    if (data.amountCents < minCents) {
      throw new Error(`Minimum promotion on this stream is $${(minCents / 100).toFixed(2)}`);
    }
    const sellerId = s.seller_id as string;
    if (sellerId === userId) throw new Error("You can't promote your own stream");

    // Cooldown: 30s between attempts per (user, stream)
    const cutoff = new Date(Date.now() - 30_000).toISOString();
    const { data: recent } = await supabaseAdmin
      .from("stream_promotions")
      .select("id, created_at")
      .eq("stream_id", data.streamId)
      .eq("promoter_id", userId)
      .gte("created_at", cutoff)
      .limit(1);
    if (recent && recent.length > 0) {
      throw new Error("Please wait a few seconds before promoting again");
    }

    // Promotions are PLATFORM revenue (advertising). They do NOT go to the
    // streamer's Connect account — no transfer_data/destination here.
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("username")
      .eq("id", userId)
      .maybeSingle();
    const promoterUsername = (profile as any)?.username ?? "viewer";

    const durationSeconds = promotionDurationSeconds(data.amountCents);

    const { data: promoRow, error: promoErr } = await supabaseAdmin
      .from("stream_promotions")
      .insert({
        stream_id: data.streamId,
        promoter_id: userId,
        promoter_username: promoterUsername,
        amount: data.amountCents / 100,
        duration_seconds: durationSeconds,
        message: data.message || null,
        status: "pending",
      })
      .select("id")
      .single();
    if (promoErr || !promoRow) throw new Error(promoErr?.message ?? "Failed to record promotion");

    // Buyer pays exactly the promotion amount; entire amount stays on the
    // platform Stripe account (no application_fee_amount, no transfer_data).
    const intent = await stripe.paymentIntents.create({
      amount: data.amountCents,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata: {
        kind: "stream_promotion",
        promotion_id: (promoRow as any).id,
        stream_id: data.streamId,
        buyer_id: userId,
        seller_id: sellerId,
        promoter_username: promoterUsername,
        amount_cents: String(data.amountCents),
        duration_seconds: String(durationSeconds),
      },
    });

    await supabaseAdmin
      .from("stream_promotions")
      .update({ stripe_payment_intent_id: intent.id })
      .eq("id", (promoRow as any).id);

    return {
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      promotionId: (promoRow as any).id,
      durationSeconds,
      subtotalCents: data.amountCents,
      platformFee: data.amountCents,
      buyerServiceFee: 0,
      buyerTotal: data.amountCents,
    };
  });

/**
 * Host updates promotion settings on their own stream.
 */
export const updateStreamPromotionSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { streamId: string; enabled?: boolean; minAmount?: number }) => {
    if (!data.streamId) throw new Error("streamId required");
    if (data.minAmount !== undefined && (!Number.isFinite(data.minAmount) || data.minAmount < 1 || data.minAmount > 100)) {
      throw new Error("Min amount must be $1–$100");
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: stream } = await supabaseAdmin
      .from("live_streams")
      .select("seller_id")
      .eq("id", data.streamId)
      .maybeSingle();
    if (!stream || (stream as any).seller_id !== userId) throw new Error("Not your stream");

    const patch: any = {};
    if (data.enabled !== undefined) patch.promotions_enabled = data.enabled;
    if (data.minAmount !== undefined) patch.promotion_min_amount = data.minAmount;
    if (Object.keys(patch).length === 0) return { ok: true };

    const { error } = await supabaseAdmin
      .from("live_streams")
      .update(patch)
      .eq("id", data.streamId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
