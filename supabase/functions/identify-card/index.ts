// Identify any trading card (TCG, sports, anime/franchise) using Lovable AI.
// Returns: name, category, set, year, tcg_number, base estimated_value (NM),
// and condition_prices map for NM/LP/MP/Damaged.
import { verifyUser } from "../_shared/auth.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM = `You are an expert MULTILINGUAL appraiser for ALL trading cards: Pokémon, Magic: The Gathering, Yu-Gi-Oh!, One Piece, Dragon Ball, sports (Topps, Panini, Upper Deck), TMNT, Marvel, anime, and any other franchise.

The input query may be in ANY language (English, Japanese 日本語, Chinese 中文, Korean 한국어, German, French, Spanish, Italian, Portuguese, Russian, etc.). Recognize the card regardless of the language used and ALWAYS return the canonical ENGLISH card name and English set/category names. Translate or transliterate as needed (e.g. "リザードン" → "Charizard", "黑莲花" → "Black Lotus", "青眼の白龍" → "Blue-Eyes White Dragon").

Given a card name, photo description, or partial info, return STRICT JSON with these keys:
{
  "name": string,                  // canonical card name
  "category": string,              // e.g. "Pokémon", "MTG", "Yu-Gi-Oh!", "One Piece", "Sports - Basketball", "TMNT"
  "set": string,                   // REQUIRED — set/series name (your best guess; never empty)
  "year": string,                  // REQUIRED — 4-digit release year (your best guess; never empty)
  "tcg_number": string,            // card number within set (e.g. "25/102") or "" if unknown
  "estimated_value": number,       // current USD market value in NEAR MINT condition, > 0
  "condition_prices": {            // USD price per condition (must all be > 0)
    "NM": number,
    "LP": number,                  // ~80-90% of NM
    "MP": number,                  // ~50-65% of NM
    "Damaged": number              // ~20-35% of NM
  },
  "trend": string                  // short note like "Stable", "Rising", "Falling"
}

CRITICAL: "set" and "year" must ALWAYS be filled with your best guess based on the card name and category — never leave them blank. If multiple printings exist, pick the most iconic/original one.

Always provide best-guess numeric values — never null, never zero. If totally unknown, estimate $1 NM and scale conditions.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { query, language } = await req.json();
    if (!query) return new Response(JSON.stringify({ error: "Missing query" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const langMap: Record<string, string> = {
      en: "English", jp: "Japanese (日本語)", kr: "Korean (한국어)",
      zh: "Chinese (中文)", de: "German", fr: "French", es: "Spanish",
      it: "Italian", pt: "Portuguese", ru: "Russian",
    };
    const langHint = language && langMap[language]
      ? `\n\nThe user is searching for the ${langMap[language]} printing of this card. If a localized version exists in that language, identify THAT specific printing (note the language in the set name e.g. "Base Set (Japanese)") and return prices for that market.`
      : "";
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        // Pro model gives MUCH better card identification + pricing accuracy.
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM + langHint },
          { role: "user", content: `Identify and price this trading card. Be precise — match the EXACT printing the user describes (set, year, card number). If the query mentions a specific set or number, prefer that printing. Query: ${query}` },
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

    // Normalize / fallback
    const nm = Number(parsed.estimated_value) > 0 ? Number(parsed.estimated_value) : 1;
    const cp = parsed.condition_prices || {};
    const out = {
      name: parsed.name || query,
      category: parsed.category || "Trading Card",
      set: parsed.set || "",
      year: parsed.year ? String(parsed.year) : "",
      tcg_number: parsed.tcg_number || "",
      estimated_value: nm,
      condition_prices: {
        NM: Number(cp.NM) > 0 ? Number(cp.NM) : nm,
        LP: Number(cp.LP) > 0 ? Number(cp.LP) : Math.round(nm * 0.85 * 100) / 100,
        MP: Number(cp.MP) > 0 ? Number(cp.MP) : Math.round(nm * 0.6 * 100) / 100,
        Damaged: Number(cp.Damaged) > 0 ? Number(cp.Damaged) : Math.max(0.5, Math.round(nm * 0.25 * 100) / 100),
      },
      trend: parsed.trend || "Stable",
    };
    return new Response(JSON.stringify(out), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
