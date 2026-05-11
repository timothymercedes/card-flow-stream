// Live-stream card HYPE generator. Uses Lovable AI to identify a card and
// produce SHORT energetic hype lines for the chat. NEVER returns prices.
import { verifyUser } from "../_shared/auth.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM = `You are a live-auction hype host for trading cards (Pokémon, MTG, Yu-Gi-Oh!, sports, anime, etc.).
You will be shown a card image. Identify the card by artwork.

CRITICAL RULES — ABSOLUTELY NO EXCEPTIONS:
- NEVER mention any price, dollar amount, market value, or "worth"
- NEVER suggest a starting bid or estimated value
- NEVER use $, €, £, ¥, USD, or any currency symbol/word
- DO NOT invent details you cannot see — if uncertain, keep it vague but exciting
- Keep it FUN, energetic, short. Two short hype lines max.

Return STRICT JSON:
{
  "name": string,           // canonical English card name (best guess)
  "category": string,       // e.g. "Pokémon", "MTG", "Sports - Basketball"
  "set_guess": string,      // best guess set/series, or "" if unsure
  "rarity_vibe": string,    // ONE of: "Chaser 🎯", "Hot Pull 🔥", "Heating Up 📈", "Solid Pickup 💪", "Rare Find 💎", "Trending 📈"
  "hype_lines": string[]    // 2 short lines (≤80 chars each) hyping the card. Examples:
                            //   "Ohhh this one's a CHASER right here 🎯"
                            //   "Demand on this print's been picking up — don't sleep!"
                            //   "Mmm clean copy too 👀"
                            //   "This one always moves on stream 🔥"
}

NEVER include prices in any field. If you accidentally start to write a price, replace it with hype words.`;

function stripPrices(s: string): string {
  if (!s) return s;
  return s
    // remove currency-prefixed numbers like $50, $1,200.50
    .replace(/[$€£¥]\s?\d[\d,]*(?:\.\d+)?/g, "")
    // remove "USD 50", "50 USD", "50 dollars"
    .replace(/\b\d[\d,]*(?:\.\d+)?\s*(usd|eur|gbp|jpy|dollars?|bucks?|cents?)\b/gi, "")
    .replace(/\b(usd|eur|gbp|jpy|dollars?|bucks?)\b/gi, "")
    // remove "worth X" / "value X" / "priced at X"
    .replace(/\b(worth|value(?:d)?\s*at|priced\s*at|market\s*value|going\s*for)\b[^.!?]*[.!?]?/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { image, language } = await req.json();
    if (!image) return new Response(JSON.stringify({ error: "Missing image" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const langHint = language ? `\nThe seller indicated this is the ${language} printing — note that in set_guess if relevant.` : "";

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM + langHint },
          { role: "user", content: [
            { type: "text", text: "Identify this card and hype it up — NO prices." },
            { type: "image_url", image_url: { url: image } },
          ]},
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      return new Response(JSON.stringify({ error: "AI error", details: t }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || "{}";
    let parsed: any;
    try { parsed = JSON.parse(content); } catch { parsed = {}; }

    const lines = Array.isArray(parsed.hype_lines) ? parsed.hype_lines : [];
    const out = {
      name: stripPrices(parsed.name || "Unknown card"),
      category: stripPrices(parsed.category || "Trading Card"),
      set_guess: stripPrices(parsed.set_guess || ""),
      rarity_vibe: stripPrices(parsed.rarity_vibe || "Solid Pickup 💪"),
      hype_lines: lines.map((l: string) => stripPrices(String(l))).filter(Boolean).slice(0, 2),
    };
    if (out.hype_lines.length === 0) out.hype_lines = ["Mmm this one's a good pickup 👀", "Don't sleep on it!"];
    return new Response(JSON.stringify(out), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
