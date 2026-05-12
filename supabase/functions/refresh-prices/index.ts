// Daily price refresh: pulls latest market prices for every distinct card identity
// referenced in vault_cards or listings (where prices are not locked), updates
// rows, logs history snapshot, and notifies vault owners of significant swings.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verifyUser, userHasAdminRole } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SWING_PCT = 0.10; // 10%
const SWING_ABS = 1.0;  // $1
const MAX_CARDS_PER_RUN = 500;

function keyOf(name: string | null, set: string | null, number: string | null) {
  return `${(name || "").toLowerCase()}|${(set || "").toLowerCase()}|${(number || "").toLowerCase()}`;
}

function norm(v: string | null | undefined) {
  return String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function firstCardNumber(v: string | null | undefined) {
  return String(v || "").replace(/#/g, "").split("/")[0].trim().replace(/^0+(\d)/, "$1");
}

function tokenScore(a: string, b: string) {
  const aa = new Set(norm(a).split(" ").filter(Boolean));
  const bb = new Set(norm(b).split(" ").filter(Boolean));
  if (!aa.size || !bb.size) return 0;
  let hit = 0;
  aa.forEach((t) => { if (bb.has(t)) hit++; });
  return hit / Math.max(aa.size, bb.size);
}

function characterName(v: string | null | undefined) {
  return norm(v)
    .replace(/\b(vmax|vstar|ex|gx|v union|v|mega|radiant|shiny|dark|light|delta species)\b/g, " ")
    .replace(/\b(full art|alt art|secret|rainbow|promo|trainer gallery|illustration rare)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sameCardFamily(a: string | null | undefined, b: string | null | undefined) {
  const aa = characterName(a);
  const bb = characterName(b);
  if (!aa || !bb) return false;
  return aa === bb || aa.startsWith(`${bb} `) || bb.startsWith(`${aa} `) || tokenScore(aa, bb) >= 0.75;
}

function setAlias(v: string) {
  const n = norm(v);
  return n === "base set" ? "base" : n;
}

function setMatchScore(cardSet: string, targetSet: string) {
  const c = norm(cardSet);
  const t = norm(targetSet);
  if (!t) return 0;
  if (c === t) return 24;
  if (setAlias(c) === setAlias(t)) return 22;
  if (c.startsWith(`${t} `)) return /\b\d+\b/.test(c.slice(t.length)) ? 4 : 10;
  if (t.startsWith(`${c} `)) return 10;
  return tokenScore(c, t) * 6;
}

function pickPriceVariant(prices: any, rarity: string | null, variantHint: string | null) {
  const hint = norm(variantHint);
  const want = norm(`${variantHint || ""} ${rarity || ""}`);
  const entries = [
    ["normal", prices?.normal],
    ["holofoil", prices?.holofoil],
    ["reverseHolofoil", prices?.reverseHolofoil],
    ["1stEditionHolofoil", prices?.["1stEditionHolofoil"]],
    ["unlimitedHolofoil", prices?.unlimitedHolofoil],
  ].filter(([, v]) => v && (v.market ?? v.mid) != null) as [string, any][];
  if (!entries.length) return null;
  // ONLY force a specific variant when the user/AI gave an EXPLICIT variant
  // hint. Never force "normal" just because the AI guessed Common/Uncommon —
  // that's the #1 cause of $0.25 prices on $80 holo cards. Default = highest.
  const explicitVariant =
    /reverse/.test(hint) ? entries.find(([k]) => k === "reverseHolofoil") :
    /1st|first/.test(hint) ? entries.find(([k]) => k === "1stEditionHolofoil") :
    /\bnon ?holo\b|^normal$/.test(hint) ? entries.find(([k]) => k === "normal") :
    /holo|foil|alt art|full art|secret|illustration|rainbow|amazing/.test(want) ?
      (entries.find(([k]) => k === "holofoil") || entries.find(([k]) => k === "unlimitedHolofoil") || entries.find(([k]) => k === "1stEditionHolofoil")) :
    null;
  const picked = explicitVariant || entries.slice().sort((a, b) => Number(b[1].market ?? b[1].mid) - Number(a[1].market ?? a[1].mid))[0];
  return { key: picked[0], value: picked[1] };
}

async function fetchPokemonImage(setName: string, number: string) {
  const num = firstCardNumber(number);
  if (!setName || !num) return { small: null as string | null, large: null as string | null };
  const apiKey = Deno.env.get("POKEMONTCG_API_KEY");
  const q = `set.name:"${setName.replace(/"/g, "")}" number:"${num}"`;
  try {
    const r = await fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&pageSize=1`, {
      headers: { ...(apiKey ? { "X-Api-Key": apiKey } : {}), "User-Agent": "PullBidLive/1.0" },
    });
    if (!r.ok) return { small: null, large: null };
    const j = await r.json();
    const c = j?.data?.[0];
    return { small: c?.images?.small ?? null, large: c?.images?.large ?? null };
  } catch { return { small: null, large: null }; }
}

function pickJtVariant(card: any, variantHint: string | null, rarity: string | null) {
  const hint = `${variantHint || ""}`.toLowerCase();
  const want = `${hint} ${rarity || ""} ${card?.rarity || ""}`.toLowerCase();
  const all = (card?.variants || []).filter((v: any) => v?.price > 0 && (v?.language || "English") === "English");
  if (!all.length) return null;
  const nm = all.filter((v: any) => v.condition === "Near Mint");
  const pool = nm.length ? nm : all;
  const wantReverse = /reverse/.test(hint);
  const wantHolo = !wantReverse && /(holo|foil|ultra|secret|illustration|alt art|full art|amazing|rainbow)/.test(want);
  const wantNormal = /\bnon ?holo\b|^normal$/.test(hint);
  let pick =
    wantReverse ? pool.find((v: any) => /reverse/i.test(v.printing)) :
    wantHolo ? pool.find((v: any) => /holo/i.test(v.printing) && !/reverse/i.test(v.printing)) :
    wantNormal ? pool.find((v: any) => /normal/i.test(v.printing)) :
    null;
  if (!pick) pick = pool.slice().sort((a: any, b: any) => (b.price || 0) - (a.price || 0))[0];
  return pick || null;
}

function conditionMap(card: any, printing: string) {
  const m: Record<string, number> = {};
  for (const v of (card?.variants || [])) {
    if (v.printing === printing && (v.language || "English") === "English" && v.price > 0) {
      m[v.condition] = v.price;
    }
  }
  return m;
}

async function fetchJustTcg(
  name: string,
  set: string | null,
  number: string | null,
  rarity: string | null,
  variantHint: string | null,
) {
  const apiKey = Deno.env.get("JUSTTCG_API_KEY");
  if (!apiKey) return null;

  const cleanName = name.replace(/"/g, "").trim();
  const cleanSet = (set || "").replace(/"/g, "").trim();
  const cleanNumber = firstCardNumber(number);

  const queries: string[] = [];
  if (cleanName && cleanSet && cleanNumber) queries.push(`${cleanName} ${cleanSet} ${cleanNumber}`);
  if (cleanName && cleanSet) queries.push(`${cleanName} ${cleanSet}`);
  if (cleanName && cleanNumber) queries.push(`${cleanName} ${cleanNumber}`);
  if (cleanName) queries.push(cleanName);

  const seen = new Set<string>();
  const candidates: any[] = [];
  for (const q of queries) {
    try {
      const url = `https://api.justtcg.com/v1/cards?game=pokemon&q=${encodeURIComponent(q)}&limit=20`;
      const r = await fetch(url, {
        headers: { "X-API-Key": apiKey, "User-Agent": "PullBidLive/1.0" },
      });
      if (!r.ok) {
        const body = await r.text().catch(() => "");
        console.warn(`[JustTCG] q="${q}" ${r.status} ${body.slice(0, 160)}`);
        continue;
      }
      const j = await r.json();
      for (const c of j?.data || []) {
        if (!c?.id || seen.has(c.id)) continue;
        seen.add(c.id);
        candidates.push(c);
      }
      if (candidates.length >= 20) break;
    } catch (e) { console.error("[JustTCG] fetch error:", e); }
  }
  if (!candidates.length) return null;

  const targetName = cleanName.toLowerCase();
  const targetSet = norm(cleanSet);
  const targetRarity = (rarity || "").toLowerCase();
  function score(c: any) {
    let s = 0;
    const cn = (c.name || "").toLowerCase();
    const cnum = firstCardNumber(c.number);
    const cset = norm(c.set_name);
    if (cleanNumber && cnum === cleanNumber) s += 60;
    else if (cleanNumber && (c.number || "").includes(cleanNumber)) s += 25;
    if (cn === targetName) s += 10;
    else if (cn.startsWith(targetName)) s += 4;
    else s += tokenScore(cn, targetName) * 3;
    if (targetSet) s += setMatchScore(cset, targetSet);
    if (targetRarity && (c.rarity || "").toLowerCase().includes(targetRarity.split(" ")[0])) s += 3;
    if ((c.variants || []).some((v: any) => v.price > 0)) s += 3;
    return s;
  }
  const scored = candidates
    .map((c) => ({ c, s: score(c), v: pickJtVariant(c, variantHint, rarity) }))
    .filter((x) => x.v && x.v.price > 0);
  
  if (!scored.length) return null;

  const ranked = scored
    .filter((x) => {
      const cn = norm(x.c?.name);
      const tn = norm(targetName);
      const nameClose = !tn || cn === tn || cn.startsWith(`${tn} `) || tokenScore(cn, tn) >= 0.5;
      return nameClose;
    })
    .sort((a, b) => b.s - a.s);
  const final = ranked.length ? ranked : scored.sort((a, b) => b.s - a.s);
  const top = final[0];

  // Filter similar to same character family
  const similar = final.slice(1).filter((x) =>
    sameCardFamily(x.c?.name, top.c?.name) || sameCardFamily(x.c?.name, targetName)
  );
  const slice = [top, ...similar].slice(0, 8);

  // Fetch images in parallel from pokemontcg.io
  const images = await Promise.all(
    slice.map((x) => fetchPokemonImage(x.c?.set_name || "", x.c?.number || ""))
  );

  const topV = top.v!;
  const market = Number(topV.price);
  const conds = conditionMap(top.c, topV.printing);
  const nm = conds["Near Mint"] ?? market;
  const lp = conds["Lightly Played"] ?? null;
  const mp = conds["Moderately Played"] ?? null;
  const hp = conds["Heavily Played"] ?? null;
  const dmg = conds["Damaged"] ?? null;

  const matches = slice.map((x, i) => ({
    name: x.c?.name ?? "",
    set: x.c?.set_name ?? "",
    year: "",
    tcg_number: x.c?.number ?? "",
    rarity: x.c?.rarity ?? "",
    variant: x.v?.printing ?? "Normal",
    estimated_value: Number(x.v?.price || 0),
    image_url: images[i]?.small || "",
  }));

  return {
    market: nm,
    low: dmg ?? hp ?? mp ?? lp ?? null,
    high: nm,
    mid: lp ?? market,
    source: "JustTCG (TCGplayer live)",
    source_url: top.c?.tcgplayerId ? `https://www.tcgplayer.com/product/${top.c.tcgplayerId}` : null,
    canonical: {
      name: top.c?.name ?? null,
      set: top.c?.set_name ?? null,
      set_code: top.c?.set ?? null,
      number: top.c?.number ?? null,
      rarity: top.c?.rarity ?? null,
      year: null,
      image_small: images[0]?.small ?? null,
      image_large: images[0]?.large ?? null,
      variant_key: topV.printing,
      match_score: top.s,
    },
    matches,
    alternatives: matches.slice(1, 6),
    raw: {
      justtcg_id: top.c?.id,
      tcgplayerId: top.c?.tcgplayerId,
      variantId: topV.id,
      printing: topV.printing,
      conditions: conds,
      priceChange7d: topV.priceChange7d,
      priceChange30d: topV.priceChange30d,
      priceChange90d: topV.priceChange90d,
      avgPrice30d: topV.avgPrice30d,
      minPrice90d: topV.minPrice90d,
      maxPrice90d: topV.maxPrice90d,
      matchScore: top.s,
    },
  };
}

async function fetchTcgPrice(
  name: string,
  set: string | null,
  number: string | null,
  rarity: string | null,
  variantHint: string | null,
) {
  // PRIMARY: JustTCG (real per-condition TCGplayer prices)
  try {
    const jt = await fetchJustTcg(name, set, number, rarity, variantHint);
    if (jt && jt.market != null) {
      console.log(`[JustTCG] hit "${jt.canonical?.name}" ${jt.canonical?.set} #${jt.canonical?.number} → $${jt.market}`);
      return jt;
    }
  } catch (e) {
    console.error("JustTCG lookup failed:", e);
  }

  // FALLBACK: pokemontcg.io / TCGPlayer cached data
  const cleanName = name.replace(/"/g, "");
  const cleanSet = (set || "").replace(/"/g, "");
  const cleanNumber = firstCardNumber(number);
  const apiKey = Deno.env.get("POKEMONTCG_API_KEY");

  const queries: string[] = [];
  if (cleanName && cleanNumber && cleanSet) queries.push(`name:"${cleanName}*" number:"${cleanNumber}" set.name:"${cleanSet}*"`);
  if (cleanName && cleanNumber) queries.push(`name:"${cleanName}*" number:"${cleanNumber}"`);
  if (cleanNumber && cleanSet) queries.push(`number:"${cleanNumber}" set.name:"${cleanSet}*"`);
  if (cleanNumber) queries.push(`number:"${cleanNumber}"`);
  if (cleanName && cleanSet) queries.push(`name:"${cleanName}*" set.name:"${cleanSet}*"`);
  if (cleanName) queries.push(`name:"${cleanName}*"`);

  const seen = new Set<string>();
  const candidates: any[] = [];
  for (const q of queries) {
    const res = await fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&pageSize=30`, {
      headers: { ...(apiKey ? { "X-Api-Key": apiKey } : {}), "User-Agent": "PullBidLive/1.0" },
    });
    if (!res.ok) continue;
    const json = await res.json();
    for (const c of json?.data || []) {
      if (!c?.id || seen.has(c.id)) continue;
      seen.add(c.id);
      candidates.push(c);
    }
    if (candidates.length >= 30 && cleanNumber) break;
  }
  if (candidates.length === 0) return null;

  // Exact printed number beats everything. Set/name/rarity break ties.
  const targetName = cleanName.toLowerCase();
  const targetSet = norm(cleanSet);
  const targetRarity = (rarity || "").toLowerCase();
  function score(c: any): number {
    let s = 0;
    const cn = (c.name || "").toLowerCase();
    const cnum = firstCardNumber(c.number);
    const cset = norm(c?.set?.name);
    if (cleanNumber && cnum === cleanNumber) s += 60;
    else if (cleanNumber && (c.number || "").includes(cleanNumber)) s += 25;
    if (cn === targetName) s += 10;
    else if (cn.startsWith(targetName)) s += 4;
    else s += tokenScore(cn, targetName) * 3;
    if (targetSet) s += setMatchScore(cset, targetSet);
    if (targetRarity && (c.rarity || "").toLowerCase() === targetRarity) s += 5;
    else if (targetRarity && (c.rarity || "").toLowerCase().includes(targetRarity.split(" ")[0])) s += 2;
    if (c?.tcgplayer?.prices) s += 3; // has pricing data
    return s;
  }
  const scored = candidates
    .map((card) => ({ card, score: score(card), picked: pickPriceVariant(card?.tcgplayer?.prices ?? {}, rarity, variantHint) }));
  const ranked = scored
    .filter((x) => {
      if (!x.picked) return false;
      const cn = norm(x.card?.name);
      const tn = norm(targetName);
      const nameClose = !tn || cn === tn || cn.startsWith(`${tn} `) || tokenScore(cn, tn) >= 0.5;
      const exactSetNumber = !!cleanNumber && firstCardNumber(x.card.number) === cleanNumber && targetSet && setMatchScore(x.card?.set?.name, targetSet) >= 20;
      return (nameClose || exactSetNumber) && (!cleanNumber || firstCardNumber(x.card.number) === cleanNumber || x.score >= 45);
    })
    .sort((a, b) => b.score - a.score);
  if (!ranked.length) return null;

  const { card, score: matchScore, picked } = ranked[0];

  const p = card?.tcgplayer?.prices ?? {};
  const variant = picked!.value;
  const variantKey = picked!.key;

  const market = variant.market ?? variant.mid ?? null;
  if (market == null) return null;

  const similarRanked = scored
    .filter((x) => {
      if (!x.picked || x.card?.id === card.id) return false;
      // Suggestions must look like the same character/card family.
      // Do NOT recommend random cards just because they share a printed number.
      return sameCardFamily(x.card?.name, card.name) || sameCardFamily(x.card?.name, targetName);
    })
    .sort((a, b) => b.score - a.score);
  const suggested = [{ card, picked, score: matchScore }, ...similarRanked].slice(0, 8);

  return {
    market,
    low: variant.low ?? null,
    high: variant.high ?? null,
    mid: variant.mid ?? null,
    source: "TCGPlayer (Pokémon TCG API)",
    source_url: card?.tcgplayer?.url ?? null,
    // Canonical card identity from TCG database — client uses these to overwrite AI guesses
    canonical: {
      name: card.name ?? null,
      set: card?.set?.name ?? null,
      set_code: card?.set?.id ?? null,
      number: card.number ?? null,
      rarity: card.rarity ?? null,
      year: card?.set?.releaseDate ? String(card.set.releaseDate).slice(0, 4) : null,
      image_small: card?.images?.small ?? null,
      image_large: card?.images?.large ?? null,
      variant_key: variantKey,
      match_score: matchScore,
    },
    matches: suggested.map((x) => ({
      name: x.card?.name ?? "",
      set: x.card?.set?.name ?? "",
      year: x.card?.set?.releaseDate ? String(x.card.set.releaseDate).slice(0, 4) : "",
      tcg_number: x.card?.number ?? "",
      rarity: x.card?.rarity ?? "",
      variant: x.picked?.key ?? "",
      estimated_value: Number(x.picked?.value?.market ?? x.picked?.value?.mid ?? 0),
      image_url: x.card?.images?.small ?? x.card?.images?.large ?? "",
    })),
    alternatives: suggested.slice(1, 6).map((x) => ({
      name: x.card?.name ?? "",
      set: x.card?.set?.name ?? "",
      year: x.card?.set?.releaseDate ? String(x.card.set.releaseDate).slice(0, 4) : "",
      tcg_number: x.card?.number ?? "",
      rarity: x.card?.rarity ?? "",
      variant: x.picked?.key ?? "",
      estimated_value: Number(x.picked?.value?.market ?? x.picked?.value?.mid ?? 0),
      image_url: x.card?.images?.small ?? x.card?.images?.large ?? "",
    })),
    raw: { tcgplayer: card?.tcgplayer ?? null, cardId: card.id, variantKey, matchedRarity: card.rarity, matchScore },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Optional: single-card refresh via ?name=&set=&number=
  const url = new URL(req.url);
  const singleName = url.searchParams.get("name");
  const singleSet = url.searchParams.get("set");
  const singleNumber = url.searchParams.get("number");

  // Allow either: CRON_SECRET, admin/owner JWT, or a signed-in user refreshing their own vault card.
  const cronSecret = Deno.env.get("CRON_SECRET");
  const providedCron = req.headers.get("x-cron-secret");
  const isCron = !!cronSecret && !!providedCron && providedCron === cronSecret;
  let limitToUserId: string | null = null;
  if (!isCron) {
    const auth = await verifyUser(req);
    if (!auth.ok) return new Response(JSON.stringify({ error: auth.error }), { status: auth.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const isAdmin = await userHasAdminRole(auth.userId);
    if (!isAdmin) {
      if (!singleName) return new Response(JSON.stringify({ error: "Admin role required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      let owned = supabase.from("vault_cards").select("id").eq("user_id", auth.userId).eq("name", singleName).neq("status", "sold").limit(1);
      if (singleSet) owned = owned.eq("tcg_set", singleSet);
      if (singleNumber) owned = owned.eq("tcg_number", singleNumber);
      const { data: ownedRows } = await owned;
      if (!ownedRows?.length) return new Response(JSON.stringify({ error: "Card not found in your vault" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      limitToUserId = auth.userId;
    }
  }

  let identities: { name: string; set: string | null; number: string | null; rarity: string | null; variant: string | null }[] = [];

  if (singleName) {
    identities = [{
      name: singleName,
      set: singleSet,
      number: singleNumber,
      rarity: url.searchParams.get("rarity"),
      variant: url.searchParams.get("variant"),
    }];
  } else {
    const { data: vc } = await supabase
      .from("vault_cards")
      .select("name, tcg_set, tcg_number")
      .eq("price_locked", false)
      .neq("status", "sold")
      .limit(MAX_CARDS_PER_RUN);
    const { data: ls } = await supabase
      .from("listings")
      .select("name, tcg_set, tcg_number")
      .limit(MAX_CARDS_PER_RUN);
    const seen = new Set<string>();
    for (const r of [...(vc || []), ...(ls || [])]) {
      const k = keyOf(r.name, r.tcg_set, r.tcg_number);
      if (seen.has(k)) continue;
      seen.add(k);
      identities.push({ name: r.name, set: r.tcg_set, number: r.tcg_number, rarity: null, variant: null });
    }
  }

  let updated = 0;
  let swings = 0;
  let firstPrice: any = null;

  for (const id of identities) {
    if (!id.name) continue;
    const price = await fetchTcgPrice(id.name, id.set, id.number, id.rarity, id.variant);
    if (!price || price.market == null) continue;
    if (!firstPrice) firstPrice = { ...price, name: id.name, set: id.set, number: id.number };

    const card_key = keyOf(id.name, id.set, id.number);
    const now = new Date().toISOString();

    // get previous market for swing detection
    const { data: prev } = await supabase
      .from("card_price_history")
      .select("market_price")
      .eq("card_key", card_key)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // log history
    await supabase.from("card_price_history").insert({
      card_key,
      name: id.name,
      tcg_set: id.set,
      tcg_number: id.number,
      market_price: price.market,
      price_low: price.low,
      price_high: price.high,
      source: price.source,
    });

    // update vault + listings (only where not locked)
    const update = {
      market_price: price.market,
      price_low: price.low,
      price_high: price.high,
      last_sold_price: price.market,
      price_source: price.source,
      price_source_url: price.source_url,
      price_updated_at: now,
      pricing_details: price.raw,
    } as any;

    let vaultUpdate = supabase
      .from("vault_cards")
      .update(update)
      .eq("name", id.name)
      .eq("price_locked", false)
      .neq("status", "sold")
      .or(`tcg_set.eq.${id.set ?? ""},tcg_set.is.null`);
    if (limitToUserId) vaultUpdate = vaultUpdate.eq("user_id", limitToUserId);
    const { data: vaultRows } = await vaultUpdate.select("id, user_id, estimated_value");

    await supabase
      .from("listings")
      .update(update)
      .eq("name", id.name);

    updated += (vaultRows?.length || 0);

    // notify on swing
    if (prev?.market_price && vaultRows?.length) {
      const oldP = Number(prev.market_price);
      const newP = Number(price.market);
      const delta = newP - oldP;
      const pct = oldP > 0 ? Math.abs(delta) / oldP : 0;
      if (pct >= SWING_PCT && Math.abs(delta) >= SWING_ABS) {
        swings++;
        const direction = delta > 0 ? "up" : "down";
        const emoji = delta > 0 ? "📈" : "📉";
        const ownerIds = Array.from(new Set(vaultRows.map((r: any) => r.user_id)));
        const rows = ownerIds.map((uid) => ({
          user_id: uid,
          type: `price_${direction}`,
          body: `${emoji} ${id.name} is ${direction} ${(pct * 100).toFixed(0)}% — $${oldP.toFixed(2)} → $${newP.toFixed(2)}`,
          link: "/vault",
        }));
        if (rows.length) await supabase.from("notifications").insert(rows);
      }
    }
  }

  return new Response(
    JSON.stringify({ ok: true, identities: identities.length, updated, swings, price: firstPrice }),
    { headers: { ...corsHeaders, "content-type": "application/json" } },
  );
});
