/**
 * Buyer payment-method server functions (Phase 2).
 *
 * Provides SetupIntent creation for saving a card on file, listing the
 * buyer's saved cards, setting the default, and removing a card. Cards are
 * stored both on Stripe (as PaymentMethods attached to a Customer) and
 * mirrored in the `buyer_payment_methods` table so we can gate bidding +
 * later auto-charge winners off-session.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getStripe } from "@/lib/stripe.server";

/** Find-or-create a Stripe Customer for this user and return its id. */
async function ensureStripeCustomerId(userId: string): Promise<string> {
  // Reuse any existing customer id stored on a prior payment method row.
  const { data: existing } = await supabaseAdmin
    .from("buyer_payment_methods" as any)
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  const existingId = (existing as any)?.stripe_customer_id as string | undefined;
  if (existingId) return existingId;

  // Otherwise create a new Customer with the user id as metadata + email.
  const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
  const email = userData?.user?.email ?? undefined;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email,
    metadata: { user_id: userId },
  });
  return customer.id;
}

/**
 * Create a SetupIntent for the buyer so the client can collect + confirm a
 * new card via Stripe Elements. Returns the client secret.
 */
export const createSetupIntent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const stripe = getStripe();
    const customerId = await ensureStripeCustomerId(userId);
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"],
      usage: "off_session",
      metadata: { user_id: userId },
    });
    return {
      clientSecret: setupIntent.client_secret!,
      customerId,
    };
  });

/**
 * Called by the client after a SetupIntent succeeds. Reads the PaymentMethod
 * from Stripe, mirrors it into `buyer_payment_methods`, and (if this is the
 * user's first card) marks it as default.
 */
export const syncSetupIntentResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { paymentMethodId: string }) => {
    if (!data?.paymentMethodId) throw new Error("paymentMethodId required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const stripe = getStripe();
    const pm = await stripe.paymentMethods.retrieve(data.paymentMethodId);
    if (!pm.customer) throw new Error("Payment method has no customer");
    const customerId = typeof pm.customer === "string" ? pm.customer : pm.customer.id;

    // Verify this Customer actually belongs to this user.
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted || (customer as any).metadata?.user_id !== userId) {
      throw new Error("Payment method does not belong to this user");
    }

    const card = pm.card;

    // Is this the first card? If so, mark as default.
    const { count } = await supabaseAdmin
      .from("buyer_payment_methods" as any)
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    const isFirst = !count || count === 0;

    const { data: row, error } = await supabaseAdmin
      .from("buyer_payment_methods" as any)
      .upsert(
        {
          user_id: userId,
          stripe_customer_id: customerId,
          stripe_payment_method_id: pm.id,
          brand: card?.brand ?? null,
          last4: card?.last4 ?? null,
          exp_month: card?.exp_month ?? null,
          exp_year: card?.exp_year ?? null,
          is_default: isFirst,
        },
        { onConflict: "stripe_payment_method_id" },
      )
      .select()
      .single();
    if (error) throw error;
    return { paymentMethod: row };
  });

export const listMyPaymentMethods = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data, error } = await supabaseAdmin
      .from("buyer_payment_methods" as any)
      .select("id,brand,last4,exp_month,exp_year,is_default,created_at")
      .eq("user_id", userId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { paymentMethods: data ?? [] };
  });

export const setDefaultPaymentMethod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("id required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { userId } = context;
    // Clear existing default, then set new one. Partial unique index
    // enforces single default per user.
    await supabaseAdmin
      .from("buyer_payment_methods" as any)
      .update({ is_default: false })
      .eq("user_id", userId)
      .eq("is_default", true);
    const { error } = await supabaseAdmin
      .from("buyer_payment_methods" as any)
      .update({ is_default: true })
      .eq("user_id", userId)
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const removePaymentMethod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("id required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: row } = await supabaseAdmin
      .from("buyer_payment_methods" as any)
      .select("stripe_payment_method_id,is_default")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!row) throw new Error("Not found");
    const pmId = (row as any).stripe_payment_method_id as string;
    try {
      await getStripe().paymentMethods.detach(pmId);
    } catch (e) {
      // If already detached on Stripe, continue removing local row.
      console.warn("paymentMethods.detach failed:", (e as Error).message);
    }
    const { error } = await supabaseAdmin
      .from("buyer_payment_methods" as any)
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw error;

    // If we removed the default and another card exists, promote the newest.
    if ((row as any).is_default) {
      const { data: next } = await supabaseAdmin
        .from("buyer_payment_methods" as any)
        .select("id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (next) {
        await supabaseAdmin
          .from("buyer_payment_methods" as any)
          .update({ is_default: true })
          .eq("id", (next as any).id);
      }
    }
    return { ok: true };
  });
