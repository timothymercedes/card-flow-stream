import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { signBetaCookie } from "@/server/betaToken.server";


export const Route = createFileRoute("/api/public/beta-verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { password?: string; code?: string } = {};
        try {
          body = await request.json();
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        const password = (body.password || "").trim();
        const code = (body.code || "").trim().toUpperCase();
        const expected = process.env.BETA_PASSWORD || "";

        // Password path
        if (password && expected && password === expected) {
          return new Response(JSON.stringify({ ok: true, via: "password" }), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Set-Cookie": (await signBetaCookie({ via: "password" })) ?? "",
            },
          });
        }

        // Invite code path
        if (code) {
          const { data: invite } = await supabaseAdmin
            .from("beta_invites")
            .select("id, max_uses, use_count, active")
            .eq("code", code)
            .maybeSingle();
          if (invite && invite.active && invite.use_count < invite.max_uses) {
            await supabaseAdmin
              .from("beta_invites")
              .update({
                use_count: invite.use_count + 1,
                last_used_at: new Date().toISOString(),
              })
              .eq("id", invite.id);
            return new Response(JSON.stringify({ ok: true, via: "code" }), {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "Set-Cookie": (await signBetaCookie({ via: "code", inviteId: invite.id })) ?? "",
              },
            });
          }
        }

        return new Response(JSON.stringify({ ok: false, error: "Invalid password or invite code" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
