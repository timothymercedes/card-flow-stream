import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getStripe } from "@/lib/stripe.server";

export const Route = createFileRoute("/api/public/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const sig = request.headers.get("stripe-signature");
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        const body = await request.text();

        if (!sig || !secret) {
          console.error("Missing Stripe signature or webhook secret");
          return new Response("Misconfigured", { status: 400 });
        }

        const stripe = getStripe();
        let event;
        try {
          event = stripe.webhooks.constructEvent(body, sig, secret);
        } catch (err) {
          console.error("Webhook signature verification failed:", err);
          return new Response("Invalid signature", { status: 400 });
        }

        try {
          switch (event.type) {
            case "account.updated": {
              const account: any = event.data.object;
              await supabaseAdmin
                .from("stripe_accounts")
                .update({
                  charges_enabled: account.charges_enabled,
                  payouts_enabled: account.payouts_enabled,
                  details_submitted: account.details_submitted,
                  country: account.country,
                  default_currency: account.default_currency,
                })
                .eq("stripe_account_id", account.id);
              break;
            }
            case "payment_intent.succeeded": {
              const pi: any = event.data.object;
              const orderId = pi.metadata?.order_id;
              const tipId = pi.metadata?.tip_id;
              if (tipId) {
                await supabaseAdmin
                  .from("stream_tips")
                  .update({ status: "paid", paid_at: new Date().toISOString() })
                  .eq("id", tipId);
              }
              if (orderId) {
                await supabaseAdmin
                  .from("orders")
                  .update({ payment_status: "paid", paid_at: new Date().toISOString() })
                  .eq("id", orderId);
              }
              break;
            }
            default:
              console.log("Unhandled Stripe event:", event.type);
          }
        } catch (err) {
          console.error("Webhook handler error:", err);
          return new Response("Handler error", { status: 500 });
        }

        return Response.json({ received: true });
      },
    },
  },
});
