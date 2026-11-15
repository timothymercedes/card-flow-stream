/**
 * Scheduled hosted CJ catalog worker (PB Bazaar Direct drafts only).
 * Callers: the managed schedule (bearer secret) or the backend-only coordinator scan token.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/bazaar-cj-scan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const token = request.headers.get("x-scan-token");
        if (token) {
          if (!/^[a-f0-9]{64}$/.test(token)) return new Response("unauthorized", { status: 401 });
          const { data } = await supabaseAdmin.from("bazaar_scan_coordinator").select("supplier_id").eq("cron_token", token).limit(1);
          if (!data?.length) return new Response("unauthorized", { status: 401 });
        } else {
          const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
          const denied = await authenticateCronRequest(request);
          if (denied) return denied;
        }
        try {
          const { runHostedTick } = await import("@/lib/suppliers/cjHostedWorker.server");
          const r = await runHostedTick(supabaseAdmin, { budgetMs: 50_000 });
          return Response.json({ ok: true, ...r });
        } catch (e) {
          console.error("bazaar-cj-scan failed", e);
          return Response.json({ ok: false, error: (e as Error).message.slice(0, 200) }, { status: 500 });
        }
      },
    },
  },
});
