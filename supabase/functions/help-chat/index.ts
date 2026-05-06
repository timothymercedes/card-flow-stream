// Help assistant: answers user questions about PullBid Live AND detects when
// the user needs human support (scams, harassment, payment disputes, etc.).
//
// Returns:
//   { reply: string, escalate?: { suggested: true, category, reason, priority } }
//
// Public (verify_jwt=false) so the bubble works for guests too.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM = `You are the in-app help assistant for PullBid Live, a live trading-card auction & marketplace app.

You help with two things:
1) FAQ-style help: going live, listing items (Buy Now / Auction / Offers), scanning cards, vault,
   bidding, shipping, payouts, order tracking, seller onboarding, livestream basics.
2) Detecting when a user needs HUMAN support and recommending escalation.

ESCALATION RULES — when ANY of these signals appear in the user message, you MUST set
"escalate": { "suggested": true, "category": <one>, "reason": <short>, "priority": <"normal"|"high"|"urgent"> }:
  - scams, fraud, fake cards, item not as described, never received item → category "scam", priority "high"
  - harassment, threats, slurs, doxxing, stalking → category "harassment", priority "urgent"
  - payment disputes, double charge, refund issue, chargeback → category "payment", priority "high"
  - inappropriate content during livestream, NSFW, hate speech on stream → category "livestream", priority "urgent"
  - account hacked, locked out, can't sign in, password reset issues → category "account", priority "high"
  - ban appeal, suspended account → category "ban_appeal", priority "normal"
  - reporting another user's behavior → category "report_user", priority "normal"
  - reporting a stream → category "report_stream", priority "high"

Output STRICT JSON only, no markdown fences:
  { "reply": "<short helpful answer, 1–3 sentences, mention they can tap a button below to escalate if needed>",
    "escalate": { "suggested": true|false, "category": "...", "reason": "...", "priority": "..." } }

When NOT escalating, set escalate.suggested = false and just answer the question.
Be concise, friendly, no fluff. Never invent prices or policies — say "I'll connect you with a human" instead.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { messages } = await req.json();
    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) throw new Error("LOVABLE_API_KEY missing");
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: SYSTEM }, ...(messages || [])],
        response_format: { type: "json_object" },
      }),
    });
    if (r.status === 429) return new Response(JSON.stringify({ error: "Busy — try again in a moment." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (r.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!r.ok) return new Response(JSON.stringify({ error: "AI error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const data = await r.json();
    const raw = data?.choices?.[0]?.message?.content || '{"reply":"Sorry, no answer.","escalate":{"suggested":false}}';
    let parsed: any;
    try { parsed = JSON.parse(raw); } catch { parsed = { reply: raw, escalate: { suggested: false } }; }
    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
