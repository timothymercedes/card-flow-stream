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
  "name": string,                   // canonical English card name
  "category": string,               // "Pokémon", "MTG", "Yu-Gi-Oh!", "One Piece", "Sports - Basketball", etc.
  "set": string,                    // REQUIRED — exact set name + variant note
  "year": string,                   // REQUIRED — 4-digit copyright/release year
  "tcg_number": string,             // exact card number e.g. "4/102" or "SV03-EN045"
  "variant": string,                // "Holo" | "Reverse Holo" | "Full Art" | "Promo" | "1st Edition" | "Standard" etc.
  "rarity": string,                 // "Common"|"Uncommon"|"Rare"|"Holo Rare"|"Ultra Rare"|"Secret Rare" etc.
  "language": string,               // "EN" | "JP" | "KR" | "CN" | "DE" | "FR" | etc.
  "confidence": { "name": number, "set": number, "year": number, "tcg_number": number, "variant": number },
  "overall_confidence": number,     // 0..1 overall match confidence for this identification
  "estimated_value": number,        // current USD market value in NEAR MINT, > 0
  "condition_prices": { "NM": number, "LP": number, "MP": number, "Damaged": number },
  "trend": string,                  // "Value Picking Up 📈" | "Hot Right Now 🔥" | "Trending Up 📈" | "Rare Find 💎" | "Stable Demand 📊"
  "alternatives": [                  // up to 3 plausible alternative matches if you are not 100% sure (omit if perfect match)
    { "name": string, "set": string, "year": string, "tcg_number": string, "variant": string, "rarity": string, "estimated_value": number }
  ]
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

CRITICAL: Always provide best-guess values — never null/zero. "set", "year", "tcg_number" must always be filled. Match the EXACT printing.

Also set "overall_confidence" (0..1) reflecting how sure you are this is the EXACT printing. If overall_confidence < 0.9, populate "alternatives" with up to 3 OTHER plausible printings the card could be (different sets/numbers/variants). Each alternative needs name, set, year, tcg_number, variant, rarity, estimated_value. Omit alternatives if you are essentially certain.`;

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
  const nm = Number(parsed?.estimated_value) > 0 ? Number(parsed.estimated_value) : 1;
  const cp = parsed?.condition_prices || {};
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
    estimated_value: nm,
    condition_prices: {
      NM: Number(cp.NM) > 0 ? Number(cp.NM) : nm,
      LP: Number(cp.LP) > 0 ? Number(cp.LP) : Math.round(nm * 0.85 * 100) / 100,
      MP: Number(cp.MP) > 0 ? Number(cp.MP) : Math.round(nm * 0.6 * 100) / 100,
      Damaged: Number(cp.Damaged) > 0 ? Number(cp.Damaged) : Math.max(0.5, Math.round(nm * 0.25 * 100) / 100),
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
        // Flash is ~3-5x faster than Pro and accurate enough for card ID; fall back to Pro only for multi-card.
        model: multi ? "google/gemini-2.5-pro" : "google/gemini-2.5-flash",
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
