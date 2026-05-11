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
              const orderIdsStr = pi.metadata?.order_ids as string | undefined;
              const tipId = pi.metadata?.tip_id;
              const chargeId = pi.latest_charge as string | undefined;
              if (tipId) {
                await supabaseAdmin
                  .from("stream_tips")
                  .update({ status: "paid", paid_at: new Date().toISOString() })
                  .eq("id", tipId);
              }
              const ids = (orderIdsStr ? orderIdsStr.split(",").filter(Boolean) : (orderId ? [orderId] : []));
              if (ids.length > 0) {
                await supabaseAdmin
                  .from("orders")
                  .update({
                    payment_status: "paid",
                    paid_at: new Date().toISOString(),
                    stripe_payment_intent_id: pi.id,
                    stripe_charge_id: chargeId ?? null,
                  })
                  .in("id", ids);
                // Clear any bid blocks once payment recovers
                const { data: paid } = await supabaseAdmin.from("orders").select("buyer_id, stream_id").in("id", ids);
                for (const o of (paid || []) as any[]) {
                  if (o.stream_id) {
                    await supabaseAdmin.from("live_bid_blocks")
                      .delete().eq("stream_id", o.stream_id).eq("user_id", o.buyer_id);
                  }
                }
              }
              break;
            }
            case "payment_intent.payment_failed": {
              const pi: any = event.data.object;
              const orderId = pi.metadata?.order_id as string | undefined;
              const orderIdsStr = pi.metadata?.order_ids as string | undefined;
              const ids = (orderIdsStr ? orderIdsStr.split(",").filter(Boolean) : (orderId ? [orderId] : []));
              if (ids.length === 0) break;
              const { data: orders } = await supabaseAdmin
                .from("orders")
                .select("id, buyer_id, seller_id, stream_id, title, payment_failure_count")
                .in("id", ids);
              const nowIso = new Date().toISOString();
              const retryDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
              for (const o of (orders || []) as any[]) {
                await supabaseAdmin.from("orders").update({
                  payment_status: "awaiting_payment",
                  payment_failure_count: (o.payment_failure_count || 0) + 1,
                  payment_failed_at: nowIso,
                  payment_retry_deadline: retryDeadline,
                }).eq("id", o.id);
                await supabaseAdmin.from("notifications").insert([
                  { user_id: o.buyer_id, type: "payment_failed", body: `❌ Payment failed for "${o.title}". Please retry within 24h.`, link: "/orders" },
                  { user_id: o.seller_id, type: "payment_failed", body: `⚠️ Buyer payment failed for "${o.title}".`, link: "/store" },
                ]);
                if (o.stream_id) {
                  await supabaseAdmin.from("live_bid_blocks").upsert({
                    stream_id: o.stream_id, user_id: o.buyer_id,
                    reason: "payment_failed", expires_at: retryDeadline,
                  }, { onConflict: "stream_id,user_id" });
                }
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
