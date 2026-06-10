import { createHash } from "crypto";

export async function verifyTurnstileToken(
  token: string,
  expectedAction?: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return { success: false, error: "turnstile_not_configured" };
  }
  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
  });
  const json = (await res.json()) as {
    success: boolean;
    "error-codes"?: string[];
    action?: string;
  };
  if (!json.success) {
    return {
      success: false,
      error: (json["error-codes"] || []).join(",") || "verification_failed",
    };
  }
  if (expectedAction && json.action && json.action !== expectedAction) {
    return { success: false, error: "action_mismatch" };
  }
  return { success: true };
}

export function hashIp(ip: string): string {
  const pepper = process.env.BETA_PASSWORD || process.env.TURNSTILE_SECRET_KEY || "";
  return createHash("sha256").update(ip + pepper).digest("hex");
}
