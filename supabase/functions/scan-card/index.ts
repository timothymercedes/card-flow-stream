// AI card recognition using Lovable AI Gateway
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
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a multilingual trading card identifier. The card text may be in ANY language (English, Japanese, Chinese, Korean, German, French, Spanish, Italian, Portuguese, Russian, etc.). Read the artwork, symbols, and text in its original language, translate/transliterate as needed, and return the canonical ENGLISH name of the card. Return JSON: {\"name\": string, \"category\": string, \"trend\": string}. Trend is one of: 'Value Picking Up 📈', 'Hot Right Now 🔥', 'Trending Up 📈', 'Rare Find 💎', 'Stable Demand 📊'. Category is the game/set like 'Pokémon', 'Magic: The Gathering', 'Sports', 'Yu-Gi-Oh!', 'One Piece'. Always identify by artwork even if text is unreadable. If truly unknown, guess plausibly — never refuse." + langHint },
          { role: "user", content: [
            { type: "text", text: langName ? `Identify this ${langName} trading card.` : "Identify this trading card." },
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
    let parsed;
    try { parsed = JSON.parse(content); } catch { parsed = { name: "Unknown Card", category: "Trading Card", trend: "Stable Demand 📊" }; }
    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
