// Generates an AI hype post about upcoming TCG / collectible drops.
// Called by pg_cron daily AND by admins manually.
import { verifyUser, userHasAdminRole } from "../_shared/auth.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CATEGORIES = [
  "pokemon", "one_piece", "magic", "yugioh", "dragon_ball",
  "lorcana", "sports", "funko", "digimon",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    let category: string | null = null;
    let topic: string | null = null;
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      category = body.category ?? null;
      topic = body.topic ?? null;
    }
    if (!category) category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];

    const sys = `You are a hype writer for PullBid Live — a live trading-card auction app.
Write a SHORT (2-3 sentences, max 280 chars) social-media post hyping up an upcoming or recent
release in the chosen category. Be exciting, use 1-2 emojis, no hashtags, no quotes.`;

    const user = topic
      ? `Category: ${category}. Topic: ${topic}. Write the hype post.`
      : `Category: ${category}. Pick a real upcoming/recent set or product and hype it up.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        tools: [{
          type: "function",
          function: {
            name: "publish_hype",
            description: "Publish the hype post.",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string", description: "Catchy 4-8 word headline" },
                body: { type: "string", description: "2-3 sentence hype body, max 280 chars" },
              },
              required: ["title", "body"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "publish_hype" } },
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) return new Response(JSON.stringify({ error: "Rate limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiRes.status === 402) return new Response(JSON.stringify({ error: "Credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await aiRes.text();
      console.error("AI error", aiRes.status, t);
      return new Response(JSON.stringify({ error: "AI failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await aiRes.json();
    const args = JSON.parse(data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments || "{}");
    if (!args.title || !args.body) throw new Error("AI returned no content");

    // Insert via service role
    const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const insertRes = await fetch(`${SUPA_URL}/rest/v1/ai_hype_posts`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ title: args.title, body: args.body, category, source: topic ? "admin" : "auto" }),
    });
    const inserted = await insertRes.json();
    return new Response(JSON.stringify({ ok: true, post: inserted?.[0] ?? inserted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
