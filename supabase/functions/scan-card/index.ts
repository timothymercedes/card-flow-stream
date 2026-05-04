// AI card recognition via Lovable AI Gateway (image-based).
// Returns the same shape as identify-card so callers (vault + listing) can
// share the same condition-based pricing logic.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LANG_MAP: Record<string, string> = {
  en: "English",
  jp: "Japanese (日本語)",
  kr: "Korean (한국어)",
  zh: "Chinese (中文)",
  de: "German",
  fr: "French",
  es: "Spanish",
  it: "Italian",
  pt: "Portuguese",
  ru: "Russian",
};

const SYSTEM = `You are an expert MULTILINGUAL trading card identifier and appraiser for ALL trading cards: Pokémon, Magic: The Gathering, Yu-Gi-Oh!, One Piece, Dragon Ball, sports (Topps, Panini, Upper Deck), TMNT, Marvel, anime, and any other franchise.

The card text may be in ANY language. Read the artwork, symbols, set codes, and text in its original language, translate/transliterate as needed, and ALWAYS return the canonical ENGLISH card name and English set/category names (e.g. "リザードン" → "Charizard").

Return STRICT JSON with these keys:
{
  "name": string,                   // canonical English card name
  "category": string,               // "Pokémon", "MTG", "Yu-Gi-Oh!", "One Piece", "Sports - Basketball", etc.
  "set": string,                    // REQUIRED — set/series name; never empty
  "year": string,                   // REQUIRED — 4-digit release year; never empty
  "tcg_number": string,             // card number e.g. "4/102" or "" if not visible
  "estimated_value": number,        // current USD market value in NEAR MINT, > 0
  "condition_prices": {             // USD price per condition (all > 0)
    "NM": number,
    "LP": number,                   // ~80-90% of NM
    "MP": number,                   // ~50-65% of NM
    "Damaged": number               // ~20-35% of NM
  },
  "trend": string                   // "Value Picking Up 📈", "Hot Right Now 🔥", "Trending Up 📈", "Rare Find 💎", "Stable Demand 📊"
}

CRITICAL: identify by artwork even if text is unreadable. Always provide best-guess values — never null/zero. "set" and "year" must always be filled.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { image, language } = await req.json();
    if (!image) return new Response(JSON.stringify({ error: "Missing image" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const langName = language && LANG_MAP[language] ? LANG_MAP[language] : null;
    const langHint = langName
      ? `\n\nThe seller has indicated this is the ${langName} printing of the card. Identify THAT specific printing — include the language in the set name (e.g. "Base Set (Japanese)"). If artwork suggests a different language than indicated, trust the seller's selection.`
      : "";

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        // Pro model gives MUCH better visual identification + market pricing.
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM + langHint },
          { role: "user", content: [
            { type: "text", text: langName ? `Identify and price this ${langName} trading card.` : "Identify and price this trading card." },
            { type: "image_url", image_url: { url: image } },
          ]},
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return new Response(JSON.stringify({ error: "AI error", details: text }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || "{}";
    let parsed: any;
    try { parsed = JSON.parse(content); } catch { parsed = {}; }

    // Normalize / fallback so callers can rely on shape.
    const nm = Number(parsed.estimated_value) > 0 ? Number(parsed.estimated_value) : 1;
    const cp = parsed.condition_prices || {};
    const out = {
      name: parsed.name || "Unknown Card",
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
      trend: parsed.trend || "Stable Demand 📊",
    };
    return new Response(JSON.stringify(out), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
