import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { paymentState } from "./paymentConfirmation";

export const getCheckoutConfirmation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ sessionId: z.string().regex(/^cs_[a-zA-Z0-9_]+$/), environment: z.enum(["sandbox", "live"]) }).parse(input))
  .handler(async ({ data, context }) => {
    const { createStripeClient, getStripeErrorMessage } = await import("@/lib/stripe.server");
    try {
      const session = await createStripeClient(data.environment).checkout.sessions.retrieve(data.sessionId);
      if (session.metadata?.userId !== context.userId && session.metadata?.buyer_id !== context.userId) return { error: "This payment does not belong to your account." };
      return { status: paymentState(session.payment_status), test: !session.livemode };
    } catch (error) { return { error: getStripeErrorMessage(error) }; }
  });

export const createSafeCheckoutTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ returnUrl: z.string().url() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: roles, error } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).in("role", ["admin", "owner"]);
    if (error || !roles?.length) return { error: "Admin access required." };
    const url = new URL(data.returnUrl);
    if (!["localhost", "pullbidlive.com", "www.pullbidlive.com", "card-flow-stream.lovable.app"].includes(url.hostname) && !url.hostname.endsWith("--c81c8301-d89c-4830-8ab7-06f678968bc1.lovable.app")) return { error: "Invalid return address." };
    if (url.pathname !== "/checkout/return") return { error: "Invalid confirmation page." };
    const { createStripeClient, getStripeErrorMessage } = await import("@/lib/stripe.server");
    try {
      const stripe = createStripeClient("sandbox");
      const found = await stripe.customers.search({ query: `metadata['userId']:'${context.userId}'`, limit: 1 });
      const customer = found.data[0] ?? await stripe.customers.create({ metadata: { userId: context.userId } });
      const session = await stripe.checkout.sessions.create({
        ui_mode: "embedded_page", mode: "payment", customer: customer.id,
        line_items: [{ price_data: { currency: "usd", product_data: { name: "PullBid checkout verification (test only)" }, unit_amount: 100 }, quantity: 1 }],
        return_url: data.returnUrl, metadata: { userId: context.userId, verification_only: "true" },
        payment_intent_data: { description: "PullBid checkout verification (test only)" },
      });
      return { clientSecret: session.client_secret };
    } catch (error) { return { error: getStripeErrorMessage(error) }; }
  });