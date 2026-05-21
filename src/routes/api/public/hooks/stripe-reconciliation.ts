// Phase 6: Daily Stripe ↔ orders reconciliation. pg_cron hits this endpoint.
import { createFileRoute } from "@tanstack/react-router";
import { reconcileStripeCharges } from "@/lib/stripe-reconcile.server";

export const Route = createFileRoute("/api/public/hooks/stripe-reconciliation")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const result = await reconcileStripeCharges({ sinceDays: 7, limit: 200 });
          return new Response(JSON.stringify({ ok: true, ...result }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e: any) {
          console.error("[stripe-reconciliation] failed", e);
          return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
