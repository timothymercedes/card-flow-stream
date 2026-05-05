// Help assistant: answers user questions about how to use PullBid Live.
// Uses Lovable AI Gateway. Public (verify_jwt=false) so the bubble works for guests too.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM = `You are the in-app help assistant for PullBid Live, a live trading-card auction & marketplace app.
Be concise, friendly, and use short bullet points. Help with: going live, listing items (Buy Now / Auction / Offers),
scanning cards, vault, bidding, shipping, payouts, and account/onboarding.
If asked something unrelated, gently redirect to app help. Never invent prices or policies you don't know — say "ask support".`;

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
      }),
    });
    if (r.status === 429) return new Response(JSON.stringify({ error: "Busy — try again in a moment." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (r.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!r.ok) return new Response(JSON.stringify({ error: "AI error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const data = await r.json();
    const reply = data?.choices?.[0]?.message?.content || "Sorry, no answer.";
    return new Response(JSON.stringify({ reply }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
