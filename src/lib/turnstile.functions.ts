import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Public site key — safe to expose to the browser. */
export const getTurnstileSiteKey = createServerFn({ method: "GET" }).handler(
  async () => {
    return { siteKey: process.env.TURNSTILE_SITE_KEY ?? "" };
  },
);

/** Verify a Turnstile token server-side against Cloudflare. */
export const verifyTurnstile = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ token: z.string().min(1).max(4096), action: z.string().max(64).optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const secret = process.env.TURNSTILE_SECRET_KEY;
    if (!secret) {
      // Fail-open in dev only when not configured. Surface clearly.
      return { success: false, error: "turnstile_not_configured" };
    }
    const body = new URLSearchParams();
    body.set("secret", secret);
    body.set("response", data.token);

    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body },
    );
    const json = (await res.json()) as {
      success: boolean;
      "error-codes"?: string[];
      action?: string;
    };
    if (!json.success) {
      return { success: false, error: (json["error-codes"] || []).join(",") || "verification_failed" };
    }
    if (data.action && json.action && json.action !== data.action) {
      return { success: false, error: "action_mismatch" };
    }
    return { success: true };
  });
