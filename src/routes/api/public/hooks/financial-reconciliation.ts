// Nightly financial reconciliation — pg_cron hits this endpoint.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireCronSecret } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/financial-reconciliation")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = requireCronSecret(request);
        if (unauthorized) return unauthorized;
        const { data, error } = await supabaseAdmin.rpc(
          "run_financial_reconciliation" as any,
          { _since: new Date(Date.now() - 7 * 86400000).toISOString() },
        );
        if (error) {
          console.error("[financial-reconciliation] failed", error);
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        const row = Array.isArray(data) ? data[0] : data;
        return new Response(JSON.stringify({ ok: true, summary: row }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
