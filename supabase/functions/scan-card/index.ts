// AI card recognition via Lovable AI Gateway (image-based).
// Single-card mode returns the same shape as before.
// Multi-card mode (multi:true) returns { cards: ScanResult[] } detecting every card visible.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LANG_MAP: Record<string, string> = {
  en: "English", jp: "Japanese (日本語)", kr: "Korean (한국어)", zh: "Chinese (中文)",
  de: "German", fr: "French", es: "Spanish", it: "Italian", pt: "Portuguese", ru: "Russian",
};

const CARD_SCHEMA_TEXT = `{
  "name": string,                   // canonical English card name
  "category": string,               // "Pokémon", "MTG", "Yu-Gi-Oh!", "One Piece", "Sports - Basketball", etc.
  "set": string,                    // REQUIRED — exact set name + variant note
  "year": string,                   // REQUIRED — 4-digit copyright/release year
  "tcg_number": string,             // exact card number e.g. "4/102" or "SV03-EN045"
  "variant": string,                // "Holo" | "Reverse Holo" | "Full Art" | "Promo" | "1st Edition" | "Standard" etc.
  "rarity": string,                 // "Common"|"Uncommon"|"Rare"|"Holo Rare"|"Ultra Rare"|"Secret Rare" etc.
  "language": string,               // "EN" | "JP" | "KR" | "CN" | "DE" | "FR" | etc.
  "confidence": { "name": number, "set": number, "year": number, "tcg_number": number, "variant": number },
  "estimated_value": number,        // current USD market value in NEAR MINT, > 0
  "condition_prices": { "NM": number, "LP": number, "MP": number, "Damaged": number },
  "trend": string                   // "Value Picking Up 📈" | "Hot Right Now 🔥" | "Trending Up 📈" | "Rare Find 💎" | "Stable Demand 📊"
}`;

const SYSTEM_SINGLE = `You are an EXPERT trading card identifier and appraiser. Handle every TCG and sports card brand: Pokémon, Magic: The Gathering, Yu-Gi-Oh!, One Piece, Dragon Ball Super, Lorcana, Flesh & Blood, Topps, Panini, Upper Deck, Bowman, Fleer, anime/franchise releases, and more.

ACCURACY IS CRITICAL — get the SET NAME, YEAR, and CARD NUMBER right.

Steps:
1. Read the SET SYMBOL (small icon, usually bottom-right or under the artwork).
2. Read the CARD NUMBER printed on the card (e.g. "4/102", "SV03-EN045", "BLK 137").
3. Read the COPYRIGHT YEAR (©YYYY). Use the most recent printing year.
4. Read the SET CODE if present (e.g. "SV3", "PAL", "BST").
5. Identify the VARIANT (Holo, Reverse Holo, Full Art, Alt Art, Promo, 1st Edition, Shadowless, Refractor, Prizm, Auto, Numbered, etc.).
6. Identify the RARITY printed on the card.
7. Identify the LANGUAGE.

Translate names to canonical English ("リザードン" → "Charizard"). If a field is unreadable, best-guess but lower its confidence.

Return STRICT JSON matching this schema:
${CARD_SCHEMA_TEXT}

CRITICAL: Always provide best-guess values — never null/zero. "set", "year", "tcg_number" must always be filled. Match the EXACT printing.`;

const SYSTEM_MULTI = `You are an EXPERT trading card identifier and appraiser. The image may contain MULTIPLE trading cards laid out together. DETECT EACH CARD SEPARATELY and identify every one of them with the same accuracy as a single-card scan.

For each card, follow these steps:
1. Read the SET SYMBOL.
2. Read the CARD NUMBER.
3. Read the COPYRIGHT YEAR.
4. Read the SET CODE.
5. Identify the VARIANT (Holo, Reverse Holo, Full Art, Alt Art, Promo, 1st Edition, Refractor, Prizm, Auto, etc.).
6. Identify the RARITY.
7. Identify the LANGUAGE; translate name to canonical English.

Skip any obvious non-cards (hands, backgrounds, sleeves). Do NOT duplicate the same card twice. If a card is mostly occluded or unreadable, omit it.

Return STRICT JSON: { "cards": [ <card>, <card>, ... ] }
Each <card> matches:
${CARD_SCHEMA_TEXT}

CRITICAL: Always provide best-guess values for required fields. Match the EXACT printing of each card.`;

function normalizeCard(parsed: any, fallbackLang?: string) {
  const nm = Number(parsed?.estimated_value) > 0 ? Number(parsed.estimated_value) : 1;
  const cp = parsed?.condition_prices || {};
  const conf = parsed?.confidence || {};
  return {
    name: parsed?.name || "Unknown Card",
    category: parsed?.category || "Trading Card",
    set: parsed?.set || "",
    year: parsed?.year ? String(parsed.year) : "",
    tcg_number: parsed?.tcg_number || "",
    variant: parsed?.variant || "Standard",
    rarity: parsed?.rarity || "",
    language: parsed?.language || (fallbackLang ? fallbackLang.toUpperCase() : "EN"),
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
    trend: parsed?.trend || "Stable Demand 📊",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { image, language, multi } = await req.json();
    if (!image) return new Response(JSON.stringify({ error: "Missing image" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const langName = language && LANG_MAP[language] ? LANG_MAP[language] : null;
    const langHint = langName
      ? `\n\nThe seller indicated the printing is ${langName}. Confirm via printed text and set symbol; include language in set name when non-English.`
      : "";

    const system = (multi ? SYSTEM_MULTI : SYSTEM_SINGLE) + langHint;
    const userText = multi
      ? "Detect EVERY trading card visible in this image and identify each one. Return JSON exactly matching {\"cards\":[...]}."
      : "Identify this trading card. Pay closest attention to the set symbol, the printed card number, and the copyright year. Return JSON exactly matching the schema.";

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: system },
          { role: "user", content: [
            { type: "text", text: userText },
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

    if (multi) {
      const arr = Array.isArray(parsed?.cards) ? parsed.cards : Array.isArray(parsed) ? parsed : [];
      const cards = arr.map((c: any) => normalizeCard(c, language));
      return new Response(JSON.stringify({ cards }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const out = normalizeCard(parsed, language);
    return new Response(JSON.stringify(out), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
