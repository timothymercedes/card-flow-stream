/**
 * Cron endpoint — release authorizations on stale offers.
 * Called by pg_cron every 5 minutes with the project anon key.
 */
import { createFileRoute } from "@tanstack/react-router";
import { expireOffersInternal } from "@/lib/offers.functions";
import { requireCronSecret } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/expire-offers")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = requireCronSecret(request);
        if (unauthorized) return unauthorized;
        try {
          const result = await expireOffersInternal();
          return Response.json({ ok: true, ...result });
        } catch (e: any) {
          console.error("expire-offers cron failed", e);
          return new Response(`error: ${e?.message || "unknown"}`, { status: 500 });
        }
      },
    },
  },
});
