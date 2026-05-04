// Moderate an image (e.g. profile avatar) using Lovable AI vision.
// Returns { allowed: boolean, reason?: string, category?: string }.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM = `You are a strict image safety moderator for a public marketplace's user profile pictures.
REJECT any image that contains: nudity, sexual content, gore, violence, hate symbols, illegal content,
self-harm, drugs, copyrighted/celebrity faces used to impersonate, harassment, or anything not suitable
for a general audience including minors. Avatars of real children are also REJECTED for safety.

ACCEPT: clear photos of an adult person, pets, scenery, abstract art, anime/cartoon characters,
trading cards, logos, and other safe-for-work imagery.

Return STRICT JSON: { "allowed": boolean, "category": string, "reason": string }
- "category" is a 1-3 word label like "selfie", "pet", "card", "nudity", "violence".
- "reason" is a short user-friendly sentence (only required when allowed=false).`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { image_url } = await req.json();
    if (!image_url) {
      return new Response(JSON.stringify({ error: "Missing image_url" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              { type: "text", text: "Moderate this profile picture and return strict JSON." },
              { type: "image_url", image_url: { url: image_url } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error("AI gateway error", resp.status, text);
      // Fail-open so the user isn't blocked by infrastructure problems.
      return new Response(JSON.stringify({ allowed: true, category: "unknown", reason: "moderation unavailable" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const data = await resp.json();
    const raw = data?.choices?.[0]?.message?.content || "{}";
    let parsed: any;
    try { parsed = JSON.parse(raw); } catch { parsed = { allowed: true, category: "unparsed" }; }
    return new Response(JSON.stringify({
      allowed: parsed.allowed !== false,
      category: parsed.category || "unknown",
      reason: parsed.reason || null,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("moderate-image error", e);
    // Fail-open on unexpected errors.
    return new Response(JSON.stringify({ allowed: true, category: "error", reason: String(e) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
