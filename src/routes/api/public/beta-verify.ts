import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const COOKIE = "pbl_beta";

function setCookie(value: string, maxAgeSec: number) {
  // Not HttpOnly — the client needs to read this cookie to know access was granted.
  // Value is a non-sensitive flag ("1"), real auth is still session-based.
  return `${COOKIE}=${value}; Path=/; Max-Age=${maxAgeSec}; Secure; SameSite=Lax`;
}

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
              "Set-Cookie": setCookie("1", 60 * 60 * 24 * 30),
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
                "Set-Cookie": setCookie("1", 60 * 60 * 24 * 30),
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
