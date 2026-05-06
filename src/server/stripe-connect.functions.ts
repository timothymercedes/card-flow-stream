import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getStripe, calculateFees } from "@/lib/stripe.server";

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
export const getMyConnectStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data } = await supabaseAdmin
      .from("stripe_accounts")
      .select("stripe_account_id, charges_enabled, payouts_enabled, details_submitted, deliveries_count")
      .eq("seller_id", userId)
      .maybeSingle();
    return data ?? null;
  });

/**
 * Create a marketplace PaymentIntent for a buyer purchasing from a seller.
 * Splits Stripe processing fees ~50/50 via a buyer service fee, takes 5% platform fee.
 */
export const createMarketplacePaymentIntent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { sellerId: string; subtotalCents: number; orderId?: string }) => {
    if (!data.sellerId) throw new Error("sellerId required");
    if (!Number.isFinite(data.subtotalCents) || data.subtotalCents < 50) {
      throw new Error("Invalid amount");
    }
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

    const fees = calculateFees(data.subtotalCents);

    const intent = await stripe.paymentIntents.create({
      amount: fees.buyerTotal,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      application_fee_amount: fees.platformFee + fees.buyerServiceFee,
      transfer_data: { destination: (sellerAcct as any).stripe_account_id },
      metadata: {
        buyer_id: userId,
        seller_id: data.sellerId,
        order_id: data.orderId ?? "",
        subtotal_cents: String(fees.subtotalCents),
        platform_fee_cents: String(fees.platformFee),
        buyer_service_fee_cents: String(fees.buyerServiceFee),
      },
    });

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

    // Insert pending tip row
    const { data: tipRow, error: tipErr } = await supabaseAdmin
      .from("stream_tips")
      .insert({
        stream_id: data.streamId,
        seller_id: sellerId,
        buyer_id: userId,
        buyer_username: buyerUsername,
        amount: data.amountCents / 100,
        message: data.message || null,
        status: "pending",
      })
      .select("id")
      .single();
    if (tipErr || !tipRow) throw new Error(tipErr?.message ?? "Failed to record tip");

    const fees = calculateFees(data.amountCents);

    const intent = await stripe.paymentIntents.create({
      amount: fees.buyerTotal,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      application_fee_amount: fees.platformFee + fees.buyerServiceFee,
      transfer_data: { destination: (sellerAcct as any).stripe_account_id },
      metadata: {
        kind: "stream_tip",
        tip_id: (tipRow as any).id,
        stream_id: data.streamId,
        buyer_id: userId,
        seller_id: sellerId,
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
