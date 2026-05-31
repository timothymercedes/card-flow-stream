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

const SUPPORTED_GAMES = [
  "Pokémon",
  "Magic: The Gathering",
  "Yu-Gi-Oh!",
  "One Piece TCG",
  "Disney Lorcana",
  "Dragon Ball Super Fusion",
  "Star Wars Unlimited",
  "Flesh and Blood",
  "Sports card",
  "Other collectible",
] as const;

const CARD_SCHEMA_TEXT = `{
  "name": string,
  "category": string,  // one of: ${SUPPORTED_GAMES.join(", ")}
  "set": string,
  "year": string,
  "tcg_number": string,
  "variant": string,
  "rarity": string,
  "language": string,
  "game_specific": {   // optional; only fill what is visible
    "mana_cost": string,        // MTG
    "type_line": string,        // MTG / YGO / Lorcana
    "attribute": string,        // YGO
    "level_or_rank": string,    // YGO
    "atk_def": string,          // YGO
    "color": string,            // One Piece / Lorcana / SWU
    "cost": string,             // One Piece / Lorcana / SWU / FAB
    "power": string,            // One Piece / SWU
    "ink_cost": string,         // Lorcana
    "player_or_team": string,   // Sports
    "manufacturer": string      // Sports (Topps, Panini, etc.)
  },
  "bbox": { "x": number, "y": number, "w": number, "h": number },
  "confidence": { "name": number, "set": number, "year": number, "tcg_number": number, "variant": number },
  "overall_confidence": number
}`;

const BBOX_INSTRUCTION = `\n\nALSO RETURN A TIGHT BOUNDING BOX around the card in the image as "bbox" with NORMALIZED coordinates (0..1) where x,y is the top-left corner and w,h are the width/height. The box must hug the 4 corners of the card tightly (no background, no hand, no table). If multiple cards, return the bbox for the most prominent one (single mode) or one per card (multi mode). If you cannot see the card edges clearly, return your best estimate covering the visible card.`;

const SYSTEM_SINGLE = `You read trading card and collectible photos for a marketplace scanner. Be FAST and literal.

STEP 1 — DETECT THE GAME / CATEGORY first. Set "category" to EXACTLY ONE of:
  ${SUPPORTED_GAMES.join(", ")}
Use visual cues:
- Pokémon: HP top-right, energy symbols, "Pokémon" or Poké-Ball logo, attacks list
- Magic: The Gathering (MTG): mana symbols (W/U/B/R/G), oval card, type line "Creature/Instant/...", set symbol bottom-center, "©Wizards"
- Yu-Gi-Oh!: ATK/DEF bottom-right, attribute icon top-right, level/rank stars, "©Konami"
- One Piece TCG: hexagonal cost top-left, power bottom-left, color band, "©BANDAI"
- Disney Lorcana: ink cost top-left in hexagon, lore value, "Disney/Ravensburger"
- Dragon Ball Super Fusion World: vertical "FB" code, energy cost top-left
- Star Wars Unlimited: cost top-left, aspect icons, "©SWU/Lucasfilm"
- Flesh and Blood: pitch value top-left (1/2/3 colored gem), "LSS"
- Sports card: photo of an athlete, manufacturer logo (Topps, Panini, Upper Deck, Bowman, Donruss, Fleer, Score), team logo, year often as "2023-24" or "'23"
- Other collectible: anything else (TCG you can't identify, gaming cards, etc.)

Your job is OCR + visible identification. Do NOT appraise, price, invent rarity, or force a set name.

MULTILINGUAL — IMPORTANT:
- Cards may be printed in ANY language: English, Japanese (日本語/カタカナ/ひらがな/漢字), Chinese (中文 simplified or traditional), Korean (한국어/한글), German, French, Spanish, Italian, Portuguese, Russian, Thai, Indonesian, etc.
- DETECT THE LANGUAGE from the printed text and set the "language" field accordingly (e.g. "Japanese", "Korean", "Chinese (Traditional)").
- ALWAYS return the canonical ENGLISH card name in "name" (translate/transliterate, e.g. リザードン → "Charizard", 청룡의 백색용 → "Blue-Eyes White Dragon", 黑莲花 → "Black Lotus"). If the card is English, return it as-is.
- Card numbers, set codes and year are usually in Latin/Arabic digits even on non-English cards — read them directly.
- Never refuse a card because it's not English. Non-Latin scripts are expected.

PHOTO QUALITY — handle gracefully (do NOT refuse):
- LOW LIGHT / DARK / blurry: read whatever IS visible (logos, set symbol, art). Lower confidence on unreadable fields rather than refusing the whole card.
- ANGLED / TILTED / perspective-warped: card edges may be skewed; still infer the name from artwork + visible letters. Bound the bbox to the full card outline including the angled corners.
- HOLO / REVERSE-HOLO / FOIL glare: reflections may wash out parts of the text. Use the artwork and any readable corner (number, year) to identify. Mark variant accordingly.
- VINTAGE (pre-2003 Pokémon, pre-2000 MTG, etc.): set symbol may be tiny or absent; rely on copyright year (e.g. "© 1999", "©1995 Wizards"), card frame style, and font era.
- PROMO / sealed: prefix like "BLACK STAR PROMO", "PROMO", numbered "/PROMO", "P", "SWSH" promo codes — set this in variant.
- Always return SOMETHING actionable. Empty strings are fine for individual fields; never return an empty card.

Return ONLY what is visible on the card:
- printed card name (translated to English for "name")
- printed card number/collector number, exactly as shown (examples: "4/102", "TG05/TG30", "SV03-EN045", "070/SM-P", "DMR-001", MTG style "215/280")
- copyright/release year if visible
- set name or set code ONLY if you can read it; otherwise empty string
- detected language and obvious finish/variant if visible
- For "variant" field, ALWAYS combine edition + finish as: "<Edition> · <Finish>" where Edition is "1st Edition" (only if the "1st Edition" / "Edition 1" / "第1版" / "1版" stamp is clearly visible) or "Unlimited" otherwise; and Finish is "Holo" / "Foil" (foil artwork/character or full foil treatment), "Reverse Holo" / "Etched" (foil background/non-artwork), or "Non-Holo" / "Non-Foil" (no foil). Sports examples: "Refractor", "Prizm", "Auto", "Patch". Example: "Unlimited · Holo" or "1st Edition · Non-Holo".
- VALUE-AFFECTING SYMBOLS, STAMPS, SIGNATURES & PREMIUM VARIANTS — CRITICAL: a card with one of these is a DIFFERENT, often FAR more valuable card than the plain version. If you see ANY of the following, APPEND it to the "variant" string after the finish (e.g. "Unlimited · Holo · Pokémon Center Stamp", "1st Edition · Holo · Prerelease Stamp"). Detect across ALL games (Pokémon, One Piece, Yu-Gi-Oh!, Magic, Sports, Lorcana, Dragon Ball, Digimon, etc.):
  Stamps/seals: Pokémon Center stamp, Staff stamp, Prerelease stamp, Championship/Event stamp, Winner stamp, League stamp, Regional/Nationals/Worlds stamp, Promo stamp.
  Symbols/editions: Gold Star symbol, 1st Edition symbol, Shadowless, Reverse Holo, Error/Misprint.
  Signatures: Signed card / autograph, on-card or sticker auto, artist signature.
  Premium/rarities: Serialized/numbered (read the "xx/yy" serial), Parallel, Alternate Art, Manga Rare, Secret Rare, Showcase, Convention/Special-Event exclusive.
  Only report markings you can actually SEE. Never invent a stamp. If none present, do not append anything.
- For "game_specific", fill ONLY the fields relevant to the detected category and visible on the card. Leave others as empty string.

If a field is unreadable, return "" and set that field confidence under 0.4. Never guess a specific printing from memory. The database will do the exact match after this.

CONFIDENCE & CLOSEST MATCHES — CRITICAL FOR COLLECTOR TRUST:
- Be HONEST about uncertainty. If you are not sure of the exact printing, set "overall_confidence" below 0.7 rather than forcing a single answer.
- When you are NOT highly confident (overall_confidence < 0.85), ALSO return an "alternatives" array of up to 3 plausible OTHER identifications the card could be (different set/number/variant/language). Order them most-to-least likely. Each alternative MUST match this shape:
  { "name": string, "set": string, "year": string, "tcg_number": string, "variant": string, "rarity": string }
- Alternatives let the collector pick the correct card instead of trusting a wrong guess. If you ARE highly confident, return an empty "alternatives" array.
- If the card's language, variant, or stamp is ambiguous, prefer LOW confidence + alternatives over a confident wrong guess.

Return STRICT JSON matching this schema:
${CARD_SCHEMA_TEXT}
PLUS an "alternatives" array (see above) when confidence is low.`;

const SYSTEM_MULTI = `You are an EXPERT trading card and collectible identifier. The image may contain MULTIPLE cards laid out together — they may be from DIFFERENT games (mixed Pokémon + MTG + Yu-Gi-Oh + One Piece + Lorcana + Sports etc.). DETECT EACH CARD SEPARATELY, identify its game, and read it with the same accuracy as a single-card scan.

For each card:
1. DETECT the game/category — set "category" to EXACTLY ONE of: ${SUPPORTED_GAMES.join(", ")}.
2. Read the SET SYMBOL.
3. Read the CARD NUMBER.
4. Read the COPYRIGHT YEAR.
5. Read the SET CODE.
6. Identify the VARIANT (Holo, Reverse Holo, Full Art, Alt Art, Promo, 1st Edition, Refractor, Prizm, Auto, Foil, Etched, etc.).
7. Identify the RARITY.
8. DETECT the LANGUAGE from printed text. Cards may be in English, Japanese (日本語), Chinese (中文 simplified/traditional), Korean (한국어), German, French, Spanish, Italian, Portuguese, Russian, Thai, etc. ALWAYS translate/transliterate the card name to canonical English (e.g. リザードン → "Charizard"). NEVER skip a card because it is not in English — non-Latin scripts are expected.
9. Fill "game_specific" only with fields relevant to the detected category.

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
  const rawBox = parsed?.bbox || parsed?.box || parsed?.bounding_box;
  let bbox: { x: number; y: number; w: number; h: number } | null = null;
  if (rawBox && typeof rawBox === "object") {
    const x = clamp01(rawBox.x, NaN);
    const y = clamp01(rawBox.y, NaN);
    const w = clamp01(rawBox.w ?? rawBox.width, NaN);
    const h = clamp01(rawBox.h ?? rawBox.height, NaN);
    if ([x, y, w, h].every((n) => isFinite(n)) && w > 0.02 && h > 0.02) {
      bbox = { x, y, w, h };
    }
  }
  return {
    name: parsed?.name || "Unknown Card",
    category: parsed?.category || "Trading Card",
    set: parsed?.set || "",
    year: parsed?.year ? String(parsed.year) : "",
    tcg_number: parsed?.tcg_number || "",
    variant: parsed?.variant || "Standard",
    rarity: parsed?.rarity || "",
    language: parsed?.language || (fallbackLang ? fallbackLang.toUpperCase() : "EN"),
    game_specific: parsed?.game_specific && typeof parsed.game_specific === "object" ? parsed.game_specific : {},
    bbox,
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

  // ─── STAGE 1 — Tiny language + game detect (skipped if caller already specified language, or multi-card) ───
  // Goal: when the seller didn't pick a language, do a ~700ms pre-pass so Stage 2 gets a language-specific
  // prompt. Improves accuracy for Japanese/Korean/Chinese/EU cards where the model otherwise wastes tokens
  // trying to read script it didn't expect.
  let detectedLanguage: string | null = language && LANG_MAP[language] ? language : null;
  let detectedGameHint: string | null = null;
  // Live/auction scans prioritise speed (target < 2s): skip the Stage-1 pre-pass
  // entirely so we make a single AI round-trip. Stage-2 still detects the
  // language from the card text itself. Vault scans keep the pre-pass for max
  // accuracy where a couple hundred ms matters less than getting it right.
  const isLiveScan = typeof source === "string" && /^live/i.test(source);
  if (!multi && !detectedLanguage && !isLiveScan) {
    try {
      const stage1 = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3.1-flash-lite-preview",
          messages: [
            { role: "system", content: `Return STRICT JSON: {"language":"en|jp|kr|zh|de|fr|es|it|pt|ru|other","game":"pokemon|mtg|yugioh|onepiece|lorcana|swu|fab|dbsfw|sports|other"}. Detect by printed text/script and game iconography. No prose.` },
            { role: "user", content: [
              { type: "text", text: "What language and game is this card?" },
              { type: "image_url", image_url: { url: image } },
            ]},
          ],
          response_format: { type: "json_object" },
          temperature: 0,
          max_tokens: 60,
        }),
      });
      if (stage1.ok) {
        const j = await stage1.json();
        const p = JSON.parse(j.choices?.[0]?.message?.content || "{}");
        if (typeof p?.language === "string" && LANG_MAP[p.language]) detectedLanguage = p.language;
        if (typeof p?.game === "string") detectedGameHint = p.game;
      }
    } catch (e) {
      console.warn("[scan-card] stage1 detect failed:", (e as Error)?.message);
    }
  }

  const langName = detectedLanguage && LANG_MAP[detectedLanguage] ? LANG_MAP[detectedLanguage] : null;
  const langHint = langName
    ? `\n\nDETECTED LANGUAGE: ${langName}. The card is printed in ${langName}. Read the native-script text directly, then ALWAYS return the canonical ENGLISH translation in "name". Set codes / numbers are usually Latin/Arabic digits even on ${langName} cards — read them literally. Set "language" field to "${langName}".`
    : "";
  const gameHint = detectedGameHint
    ? `\n\nDETECTED GAME (hint): ${detectedGameHint}. Verify this against the card before locking in "category".`
    : "";

  const system = (multi ? SYSTEM_MULTI : SYSTEM_SINGLE) + langHint + gameHint + BBOX_INSTRUCTION;
  const userText = multi
    ? "Detect EVERY trading card visible in this image and identify each one. Return JSON exactly matching {\"cards\":[...]}."
    : "Identify this trading card. Pay closest attention to the set symbol, the printed card number, and the copyright year. Return JSON exactly matching the schema.";

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        // Single-card uses the fastest preview model (sub-3s round-trip).
        // Multi-card still benefits from a stronger model for layout parsing.
        model: multi ? "google/gemini-3-flash-preview" : "google/gemini-3.1-flash-lite-preview",
        messages: [
          { role: "system", content: system },
          { role: "user", content: [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: image } },
          ]},
        ],
        response_format: { type: "json_object" },
        temperature: 0,
        max_tokens: multi ? 2560 : 900,
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
      const cards = arr.map((c: any) => normalizeCard(c, detectedLanguage || language));
      const top = cards[0];
      await admin.from("card_scans").insert({
        user_id: userId, status: cards.length > 0 ? "ok" : "no_cards",
        multi: true, language, source, cards_detected: cards.length,
        top_name: top?.name, top_set: top?.set, top_value: top?.estimated_value,
        duration_ms: Date.now() - t0,
      });
      return jsonResp({ cards, ocr_raw: parsed });
    }

    const out = normalizeCard(parsed, detectedLanguage || language);
    (out as any).ocr_raw = parsed;

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
