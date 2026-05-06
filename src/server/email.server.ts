// Server-only email helpers via Resend connector gateway.
const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  from?: string;
}) {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!LOVABLE_API_KEY || !RESEND_API_KEY) {
    console.warn("Email skipped: missing LOVABLE_API_KEY or RESEND_API_KEY");
    return { skipped: true };
  }
  const res = await fetch(`${GATEWAY_URL}/emails`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": RESEND_API_KEY,
    },
    body: JSON.stringify({
      from: opts.from || "PullBidLive <onboarding@resend.dev>",
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error("Resend error", res.status, text);
    return { error: text };
  }
  return { ok: true };
}
