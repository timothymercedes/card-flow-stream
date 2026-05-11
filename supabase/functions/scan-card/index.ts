// AI card recognition via Lovable AI Gateway (image-based).
// Single-card mode returns the same shape as before.
// Multi-card mode (multi:true) returns { cards: ScanResult[] } detecting every card visible.
// Production hardening: requires auth, enforces per-user rate limit, logs every scan to card_scans.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LANG_MAP: Record<string, string> = {
  en: "English", jp: "Japanese (日本語)", kr: "Korean (한국어)", zh: "Chinese (中文)",
  de: "German", fr: "French", es: "Spanish", it: "Italian", pt: "Portuguese", ru: "Russian",
};

const CARD_SCHEMA_TEXT = `{
  "name": string,
  "category": string,
  "set": string,
  "year": string,
  "tcg_number": string,
  "variant": string,
  "rarity": string,
  "language": string,
  "confidence": { "name": number, "set": number, "year": number, "tcg_number": number, "variant": number },
  "overall_confidence": number
}`;

const SYSTEM_SINGLE = `You read trading card photos for a marketplace scanner. Be FAST and literal.

Your only job is OCR + visible identification. Do NOT appraise, price, invent rarity, or force a set name.

MULTILINGUAL — IMPORTANT:
- Cards may be printed in ANY language: English, Japanese (日本語/カタカナ/ひらがな/漢字), Chinese (中文 simplified or traditional), Korean (한국어/한글), German, French, Spanish, Italian, Portuguese, Russian, Thai, Indonesian, etc.
- DETECT THE LANGUAGE from the printed text and set the "language" field accordingly (e.g. "Japanese", "Korean", "Chinese (Traditional)").
- ALWAYS return the canonical ENGLISH card name in "name" (translate/transliterate, e.g. リザードン → "Charizard", 청룡의 백색용 → "Blue-Eyes White Dragon", 黑莲花 → "Black Lotus"). If the card is English, return it as-is.
- Card numbers, set codes and year are usually in Latin/Arabic digits even on non-English cards — read them directly.
- Never refuse a card because it's not English. Non-Latin scripts are expected.

Return ONLY what is visible on the card:
- printed card name (translated to English for "name")
- printed card number, exactly as shown (examples: "4/102", "TG05/TG30", "SV03-EN045", "070/SM-P")
- copyright/release year if visible
- set name or set code ONLY if you can read it; otherwise empty string
- detected language and obvious finish/variant if visible
- For "variant" field, ALWAYS combine edition + finish as: "<Edition> · <Finish>" where Edition is "1st Edition" (only if the "1st Edition" / "Edition 1" / "第1版" / "1版" stamp is clearly visible) or "Unlimited" otherwise; and Finish is "Holo" (foil artwork/character), "Reverse Holo" (foil background/non-artwork), or "Non-Holo" (no foil). Example: "Unlimited · Holo" or "1st Edition · Non-Holo".

If a field is unreadable, return "" and set that field confidence under 0.4. Never guess a specific printing from memory. The database will do the exact match after this.

Return STRICT JSON matching this schema:
${CARD_SCHEMA_TEXT}`;

const SYSTEM_MULTI = `You are an EXPERT trading card identifier and appraiser. The image may contain MULTIPLE trading cards laid out together. DETECT EACH CARD SEPARATELY and identify every one of them with the same accuracy as a single-card scan.

For each card, follow these steps:
1. Read the SET SYMBOL.
2. Read the CARD NUMBER.
3. Read the COPYRIGHT YEAR.
4. Read the SET CODE.
5. Identify the VARIANT (Holo, Reverse Holo, Full Art, Alt Art, Promo, 1st Edition, Refractor, Prizm, Auto, etc.).
6. Identify the RARITY.
7. DETECT the LANGUAGE from printed text. Cards may be in English, Japanese (日本語), Chinese (中文 simplified/traditional), Korean (한국어), German, French, Spanish, Italian, Portuguese, Russian, Thai, etc. ALWAYS translate/transliterate the card name to canonical English (e.g. リザードン → "Charizard"). NEVER skip a card because it is not in English — non-Latin scripts are expected.

Skip any obvious non-cards (hands, backgrounds, sleeves). Do NOT duplicate the same card twice. If a card is mostly occluded or unreadable, omit it.

Return STRICT JSON: { "cards": [ <card>, <card>, ... ] }
Each <card> matches:
${CARD_SCHEMA_TEXT}

CRITICAL: Do not include prices. If a field is unreadable, return an empty string and low confidence.`;

function clamp01(n: any, def = 0.5) {
  const v = Number(n);
  if (!isFinite(v)) return def;
  return Math.max(0, Math.min(1, v));
}

function normalizeAlternative(a: any) {
  const v = Number(a?.estimated_value);
  return {
    name: String(a?.name || "").trim(),
    set: String(a?.set || "").trim(),
    year: a?.year ? String(a.year) : "",
    tcg_number: String(a?.tcg_number || "").trim(),
    variant: String(a?.variant || "Standard").trim(),
    rarity: String(a?.rarity || "").trim(),
    estimated_value: v > 0 ? v : 0,
    image_url: typeof a?.image_url === "string" ? a.image_url : "",
  };
}

function normalizeCard(parsed: any, fallbackLang?: string) {
  const conf = parsed?.confidence || {};
  const perField = {
    name: clamp01(conf.name),
    set: clamp01(conf.set),
    year: clamp01(conf.year),
    tcg_number: clamp01(conf.tcg_number),
    variant: clamp01(conf.variant),
  };
  // Derive overall: prefer model-supplied, otherwise average the field confidences
  const supplied = clamp01(parsed?.overall_confidence, NaN);
  const avg =
    (perField.name + perField.set + perField.year + perField.tcg_number + perField.variant) / 5;
  const overall = isFinite(supplied) ? supplied : avg;
  const alts = Array.isArray(parsed?.alternatives)
    ? parsed.alternatives.slice(0, 3).map(normalizeAlternative).filter((a) => a.name)
    : [];
  return {
    name: parsed?.name || "Unknown Card",
    category: parsed?.category || "Trading Card",
    set: parsed?.set || "",
    year: parsed?.year ? String(parsed.year) : "",
    tcg_number: parsed?.tcg_number || "",
    variant: parsed?.variant || "Standard",
    rarity: parsed?.rarity || "",
    language: parsed?.language || (fallbackLang ? fallbackLang.toUpperCase() : "EN"),
    confidence: perField,
    overall_confidence: overall,
    match_label: overall >= 0.9 ? `${Math.round(overall * 100)}% Match` : overall >= 0.7 ? `Likely Match (${Math.round(overall * 100)}%)` : "Possible Match",
    estimated_value: 0,
    condition_prices: {
      NM: 0,
      LP: 0,
      MP: 0,
      Damaged: 0,
    },
    trend: parsed?.trend || "Stable Demand 📊",
    alternatives: alts,
  };
}

// Best-effort image enrichment using the free Pokémon TCG API (no key required for reads).
async function enrichPokemonImage(name: string, num?: string, set?: string): Promise<string> {
  try {
    if (!name) return "";
    const parts: string[] = [`name:"${name.replace(/"/g, "")}"`];
    if (num) {
      const n = num.split("/")[0].trim();
      if (n) parts.push(`number:"${n}"`);
    }
    const q = encodeURIComponent(parts.join(" "));
    const url = `https://api.pokemontcg.io/v2/cards?q=${q}&pageSize=5`;
    const r = await fetch(url);
    if (!r.ok) return "";
    const j = await r.json();
    const list = Array.isArray(j?.data) ? j.data : [];
    if (!list.length) return "";
    const wantSet = (set || "").toLowerCase();
    const match = wantSet
      ? list.find((c: any) => String(c?.set?.name || "").toLowerCase().includes(wantSet)) || list[0]
      : list[0];
    return match?.images?.small || match?.images?.large || "";
  } catch {
    return "";
  }
}

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const t0 = Date.now();

  // Service-role admin client for rate-limit RPC + audit insert
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // Authenticate caller via JWT in Authorization header
  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: u } = await userClient.auth.getUser();
  const userId = u?.user?.id;
  if (!userId) {
    return jsonResp({ error: "Sign in to scan cards" }, 401);
  }

  // Rate limit (uses service role; RPC is locked to service_role grant)
  const { data: limit, error: rlErr } = await admin.rpc("rate_limit_card_scan", { _user_id: userId });
  if (rlErr) {
    console.error("rate_limit_card_scan error", rlErr);
  } else if (limit && (limit as any).allowed === false) {
    const reason = (limit as any).reason;
    const msg = reason === "hour_limit"
      ? `You've hit the hourly scan limit (${(limit as any).limit}/hr). Try again in an hour.`
      : reason === "day_limit"
      ? `Daily scan limit reached (${(limit as any).limit}/day).`
      : "Too many scans. Slow down and try again.";
    await admin.from("card_scans").insert({
      user_id: userId, status: "rate_limited", error_message: reason, multi: false,
    });
    return jsonResp({ error: msg, code: "rate_limited" }, 429);
  }

  let body: any = {};
  try { body = await req.json(); } catch {}
  const { image, language, multi, source } = body || {};
  if (!image) return jsonResp({ error: "Missing image" }, 400);

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return jsonResp({ error: "AI service is not configured" }, 500);

  const langName = language && LANG_MAP[language] ? LANG_MAP[language] : null;
  const langHint = langName
    ? `\n\nThe seller indicated the printing is ${langName}. Confirm via printed text and set symbol; include language in set name when non-English.`
    : "";

  const system = (multi ? SYSTEM_MULTI : SYSTEM_SINGLE) + langHint;
  const userText = multi
    ? "Detect EVERY trading card visible in this image and identify each one. Return JSON exactly matching {\"cards\":[...]}."
    : "Identify this trading card. Pay closest attention to the set symbol, the printed card number, and the copyright year. Return JSON exactly matching the schema.";

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        // Flash is fast and accurate enough to read name + set + card number,
        // which is all we need — TCG database is the source of truth for rarity,
        // variant and price afterwards. Multi-card stays on Pro for layout parsing.
        model: multi ? "google/gemini-2.5-pro" : "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: image } },
          ]},
        ],
        response_format: { type: "json_object" },
        temperature: 0,
        max_tokens: multi ? 2048 : 512,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      const friendly = resp.status === 429
        ? "AI service is busy — please try again in a moment."
        : resp.status === 402
        ? "AI credits exhausted. Please contact support."
        : "AI scan failed. Try again with better lighting.";
      await admin.from("card_scans").insert({
        user_id: userId, status: "error", error_message: text.slice(0, 500),
        multi: !!multi, language, source, duration_ms: Date.now() - t0,
      });
      return jsonResp({ error: friendly, code: "ai_error" }, resp.status === 429 ? 429 : 502);
    }

    const data = await resp.json();
    const finishReason = data.choices?.[0]?.finish_reason || data.stop_reason;
    if (finishReason === "length" || finishReason === "max_tokens") {
      throw new Error("AI response truncated");
    }
    const content = data.choices?.[0]?.message?.content || "{}";
    let parsed: any;
    try { parsed = JSON.parse(content); } catch { parsed = {}; }

    if (multi) {
      const arr = Array.isArray(parsed?.cards) ? parsed.cards : Array.isArray(parsed) ? parsed : [];
      const cards = arr.map((c: any) => normalizeCard(c, language));
      const top = cards[0];
      await admin.from("card_scans").insert({
        user_id: userId, status: cards.length > 0 ? "ok" : "no_cards",
        multi: true, language, source, cards_detected: cards.length,
        top_name: top?.name, top_set: top?.set, top_value: top?.estimated_value,
        duration_ms: Date.now() - t0,
      });
      return jsonResp({ cards });
    }

    const out = normalizeCard(parsed, language);

    // Enrich alternative images for Pokémon cards so the "Did you mean?" sheet is visual.
    const isPokemon = /pok[eé]mon/i.test(out.category);
    if (isPokemon && out.alternatives.length > 0) {
      const enriched = await Promise.all(
        out.alternatives.map(async (a) => {
          if (a.image_url) return a;
          const img = await enrichPokemonImage(a.name, a.tcg_number, a.set);
          return { ...a, image_url: img };
        }),
      );
      out.alternatives = enriched;
    }

    await admin.from("card_scans").insert({
      user_id: userId, status: "ok",
      multi: false, language, source, cards_detected: 1,
      top_name: out.name, top_set: out.set, top_value: out.estimated_value,
      duration_ms: Date.now() - t0,
    });
    return jsonResp(out);
  } catch (e) {
    await admin.from("card_scans").insert({
      user_id: userId, status: "error", error_message: String(e).slice(0, 500),
      multi: !!multi, language, source, duration_ms: Date.now() - t0,
    });
    return jsonResp({ error: "Scan failed unexpectedly. Please try again." }, 500);
  }
});
