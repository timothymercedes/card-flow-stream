import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { verifyTurnstileToken, hashIp } from "@/lib/turnstile.server";

const schema = z.object({
  email: z.string().email().max(255),
  name: z.string().max(100).optional(),
  role: z.enum(["buyer", "seller", "host", "both"]).default("buyer"),
  message: z.string().max(1000).optional(),
  turnstileToken: z.string().min(1).max(4096),
});

function getClientIp(request: Request): string {
  const headers = request.headers;
  return (
    headers.get("cf-connecting-ip") ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}

export const Route = createFileRoute("/api/public/beta-request")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
        }

        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { ok: false, error: "Invalid input: " + parsed.error.issues.map((i) => i.message).join(", ") },
            { status: 400 },
          );
        }

        const { email, name, role, message, turnstileToken } = parsed.data;

        // Verify Turnstile
        const turnstile = await verifyTurnstileToken(turnstileToken, "beta_request");
        if (!turnstile.success) {
          return Response.json({ ok: false, error: "Turnstile verification failed. Please try again." }, { status: 403 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const normalizedEmail = email.trim().toLowerCase();
        const ip = getClientIp(request);
        const ipHash = hashIp(ip);

        // Rate limit: 1 request per email per 24 hours
        const { data: recentEmail } = await supabaseAdmin
          .from("beta_access_requests")
          .select("id, created_at")
          .eq("email", normalizedEmail)
          .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .limit(1)
          .maybeSingle();

        if (recentEmail) {
          return Response.json(
            { ok: false, error: "You’ve already requested beta access with this email. Please wait for your invite." },
            { status: 429 },
          );
        }

        // Rate limit: 10 requests per IP per hour
        const { count: ipCount, error: ipCountError } = await supabaseAdmin
          .from("beta_access_requests")
          .select("*", { count: "exact", head: true })
          .eq("ip_hash", ipHash)
          .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());

        if (ipCountError) {
          console.error("Rate limit IP count error:", ipCountError);
        }
        if ((ipCount ?? 0) >= 10) {
          return Response.json(
            { ok: false, error: "Too many requests from this network. Please try again in an hour." },
            { status: 429 },
          );
        }

        // Insert request
        const { error: insertError } = await supabaseAdmin.from("beta_access_requests").insert({
          email: normalizedEmail,
          name: name?.trim() || null,
          role,
          message: message?.trim() || null,
          ip_hash: ipHash,
          user_agent: request.headers.get("user-agent") || null,
        });

        if (insertError) {
          console.error("Beta request insert error:", insertError);
          return Response.json({ ok: false, error: "Could not save your request. Please try again." }, { status: 500 });
        }

        return Response.json({ ok: true });
      },
    },
  },
});
