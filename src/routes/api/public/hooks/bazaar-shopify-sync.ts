import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/hooks/bazaar-shopify-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        try {
          const { syncShopifyCatalog } = await import("@/lib/suppliers/shopifySync.server");
          return Response.json({ ok: true, ...(await syncShopifyCatalog()) });
        } catch (e) {
          console.error("shopify sync failed", (e as Error).message);
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
