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

const SYSTEM = `You are an EXPERT trading card identifier and appraiser. You handle every TCG and sports card brand: Pokémon, Magic: The Gathering, Yu-Gi-Oh!, One Piece, Dragon Ball Super, Lorcana, Flesh & Blood, Topps, Panini, Upper Deck, Bowman, Fleer, anime/franchise releases, and more.

ACCURACY IS CRITICAL — get the SET NAME, YEAR, and CARD NUMBER right.

Steps you MUST follow when reading a card image:
1. Read the SET SYMBOL (small icon, usually bottom-right or under the artwork). The set symbol uniquely identifies the set — match it against your knowledge of all release symbols.
2. Read the CARD NUMBER printed on the card (usually like "4/102", "SV03-EN045", "BLK 137", "PSA 7"). Return it verbatim.
3. Read the COPYRIGHT YEAR printed at the bottom (©YYYY). This is the most reliable year. If multiple years appear, return the most recent printing year.
4. Read the SET CODE if present (small alphanumeric like "SV3", "PAL", "BST"). Use it to confirm the set.
5. Identify the VARIANT (Holo, Reverse Holo, Full Art, Alt Art, Promo, 1st Edition, Shadowless, Refractor, Prizm, Auto, Numbered, etc.). Note it in the set name like "Base Set Shadowless" or "Paldea Evolved Reverse Holo".
6. Identify the LANGUAGE from the printed text. Note language in set name when not English: "Base Set (Japanese)".

Card text may be in any language — translate the card NAME to its canonical English form ("リザードン" → "Charizard").

If you cannot read a field with HIGH confidence, make a best guess BUT lower your confidence score for that field.

Return STRICT JSON with these keys:
{
  "name": string,                   // canonical English card name
  "category": string,               // "Pokémon", "MTG", "Yu-Gi-Oh!", "One Piece", "Sports - Basketball", etc.
  "set": string,                    // REQUIRED — exact set name + variant note (e.g. "Paldea Evolved (Reverse Holo)")
  "year": string,                   // REQUIRED — 4-digit copyright/release year
  "tcg_number": string,             // exact card number e.g. "4/102" or "SV03-EN045"
  "variant": string,                // "Holo" | "Reverse Holo" | "Full Art" | "Promo" | "1st Edition" | "Standard" | etc.
  "language": string,               // "EN" | "JP" | "KR" | "CN" | "DE" | "FR" | etc.
  "confidence": {                   // 0..1 per field — be honest
    "name": number,
    "set": number,
    "year": number,
    "tcg_number": number,
    "variant": number
  },
  "estimated_value": number,        // current USD market value in NEAR MINT, > 0
  "condition_prices": {             // USD price per condition (all > 0)
    "NM": number,
    "LP": number,                   // ~80-90% of NM
    "MP": number,                   // ~50-65% of NM
    "Damaged": number               // ~20-35% of NM
  },
  "trend": string                   // "Value Picking Up 📈", "Hot Right Now 🔥", "Trending Up 📈", "Rare Find 💎", "Stable Demand 📊"
}

CRITICAL: Always provide best-guess values — never null/zero. "set", "year", "tcg_number" must always be filled. Match the EXACT printing — do not guess a more famous printing if the card in front of you is a different one.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { image, language } = await req.json();
    if (!image) return new Response(JSON.stringify({ error: "Missing image" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const langName = language && LANG_MAP[language] ? LANG_MAP[language] : null;
    const langHint = langName
      ? `\n\nThe seller indicated this is the ${langName} printing. Confirm via printed text and the set symbol; include the language in the set name if non-English (e.g. "Base Set (Japanese)").`
      : "";

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        // Pro model — the Lite model was misreading set symbols and card numbers.
        // Pro reads small text + symbols dramatically better, which is the whole point of accuracy.
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM + langHint },
          { role: "user", content: [
            { type: "text", text: "Identify this trading card. Pay closest attention to the set symbol, the printed card number, and the copyright year — those drive the price. Return JSON exactly matching the schema." },
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
    const conf = parsed.confidence || {};
    const out = {
      name: parsed.name || "Unknown Card",
      category: parsed.category || "Trading Card",
      set: parsed.set || "",
      year: parsed.year ? String(parsed.year) : "",
      tcg_number: parsed.tcg_number || "",
      variant: parsed.variant || "Standard",
      language: parsed.language || (language ? language.toUpperCase() : "EN"),
      confidence: {
        name: Number(conf.name) || 0.5,
        set: Number(conf.set) || 0.5,
        year: Number(conf.year) || 0.5,
        tcg_number: Number(conf.tcg_number) || 0.5,
        variant: Number(conf.variant) || 0.5,
      },
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
