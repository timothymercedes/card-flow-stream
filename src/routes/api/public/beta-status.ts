import { createFileRoute } from "@tanstack/react-router";
import { readBetaClaim } from "@/server/betaToken.server";

export const Route = createFileRoute("/api/public/beta-status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const json = (ok: boolean) => new Response(JSON.stringify({ ok }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
        const claim = await readBetaClaim(request);
        if (!claim) return json(false);
        if (claim.via === "code") {
          if (!claim.inviteId) return json(false);
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data } = await supabaseAdmin.from("beta_invites").select("active").eq("id", claim.inviteId).maybeSingle();
          return json(!!data?.active);
        }
        return json(true);
      },
    },
  },
});
