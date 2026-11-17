import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function isStaff(supabase: any, userId: string) {
  const [a, o] = await Promise.all([supabase.rpc("has_role", { _user_id: userId, _role: "admin" }), supabase.rpc("has_role", { _user_id: userId, _role: "owner" })]);
  return !!(a.data || o.data);
}

/** Paid boost: priced by the database, one-time (no subscription), activated only by the signed payment notification. */
export const startPaidBoostCheckout = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ listingId: z.string().uuid(), packageKey: z.string().regex(/^[a-z0-9_]{1,20}$/), hours: z.number().int().min(1).max(24).optional(), environment: z.enum(["sandbox", "live"]) }).parse(i))
  .handler(async ({ data, context }): Promise<{ clientSecret: string; boostId: string } | { error: string }> => {
    if (data.environment !== "sandbox") return { error: "Paid boosts are in test mode only right now." };
    // Test mode: test cards would make boosts free on the shared feed, so only staff can run test purchases.
    if (!(await isStaff(context.supabase, context.userId))) return { error: "Paid boosts open when live payments are switched on. Use your free weekly boost for now." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { boostErrorMessage } = await import("@/lib/listingBoosts");
    const { data: boost, error } = await (supabaseAdmin as any).rpc("create_paid_listing_boost", { _seller: context.userId, _listing_id: data.listingId, _package: data.packageKey, _hours: data.hours ?? null, _environment: "sandbox" });
    if (error || !boost) return { error: boostErrorMessage(error?.message ?? "") };
    const { createStripeClient, getStripeErrorMessage } = await import("@/lib/stripe.server");
    try {
      const stripe = createStripeClient("sandbox");
      const email = (context.claims as { email?: string } | undefined)?.email;
      const found = await stripe.customers.search({ query: `metadata['userId']:'${context.userId}'`, limit: 1 });
      const customer = found.data[0]?.id ?? (await stripe.customers.create({ ...(email && { email }), metadata: { userId: context.userId } })).id;
      const origin = new URL(getRequest().url).origin;
      const session = await stripe.checkout.sessions.create({
        mode: "payment", ui_mode: "embedded_page", customer, payment_method_types: ["card"],
        return_url: `${origin}/market/${data.listingId}?boost_session={CHECKOUT_SESSION_ID}`,
        line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: boost.amount_cents, product_data: { name: `Listing boost · ${boost.hours}h` } } }],
        metadata: { listing_boost_id: boost.id, userId: context.userId },
        payment_intent_data: { description: `Listing boost · ${boost.hours}h`, metadata: { listing_boost_id: boost.id } },
      }, { idempotencyKey: `boost_cs_${boost.id}` });
      if (session.amount_total !== boost.amount_cents || session.livemode) return { error: "Payment couldn't be started safely." };
      await supabaseAdmin.from("listing_boosts").update({ stripe_checkout_session_id: session.id }).eq("id", boost.id);
      return { clientSecret: session.client_secret ?? "", boostId: boost.id };
    } catch (e) {
      await supabaseAdmin.from("listing_boosts").update({ status: "cancelled" }).eq("id", boost.id).eq("status", "pending");
      return { error: getStripeErrorMessage(e) };
    }
  });
