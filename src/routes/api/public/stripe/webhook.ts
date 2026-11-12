import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/stripe/webhook")({
  server: { handlers: { POST: async ({ request }) => {
    const signature = request.headers.get("stripe-signature");
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!signature || !secret) return new Response("Missing signature or configuration", { status: 400 });
    try {
      const { getStripe } = await import("@/lib/stripe.server");
      const event = await getStripe().webhooks.constructEventAsync(await request.text(), signature, secret);
      const { processStripeEvent } = await import("@/lib/stripeWebhook.server");
      return processStripeEvent(event);
    } catch { return new Response("Invalid webhook", { status: 400 }); }
  } } },
});
