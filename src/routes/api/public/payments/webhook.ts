import { createFileRoute } from "@tanstack/react-router";
import { paymentState } from "@/lib/paymentConfirmation";

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: { handlers: { POST: async ({ request }) => {
    const environment = new URL(request.url).searchParams.get("env");
    if (environment !== "sandbox" && environment !== "live") return new Response("Invalid environment", { status: 400 });
    let event;
    try {
      const { verifyManagedStripeEvent } = await import("@/lib/stripe.server");
      event = await verifyManagedStripeEvent(request, environment);
    } catch { return new Response("Invalid signature", { status: 400 }); }
    // Test payments never change shared production orders or balances.
    if (environment === "sandbox") return Response.json({ received: true, test: true });
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object;
      if (paymentState(session.payment_status) === "pending") return Response.json({ received: true, pending: true });
      const intentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
      if (intentId) {
        try {
          const { createStripeClient } = await import("@/lib/stripe.server");
          const intent = await createStripeClient(environment).paymentIntents.retrieve(intentId);
          if (intent.status !== "succeeded") return Response.json({ received: true, pending: true });
          const { processStripeEvent } = await import("@/lib/stripeWebhook.server");
          return processStripeEvent({ ...event, type: "payment_intent.succeeded", data: { object: intent } });
        } catch { return new Response("Payment reconciliation failed", { status: 500 }); }
      }
    }
    const { processStripeEvent } = await import("@/lib/stripeWebhook.server");
    return processStripeEvent(event);
  } } },
});