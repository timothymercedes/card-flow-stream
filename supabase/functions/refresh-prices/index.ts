// Daily price refresh: pulls latest market prices for every distinct card identity
// referenced in vault_cards or listings (where prices are not locked), updates
// rows, logs history snapshot, and notifies vault owners of significant swings.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

async function fetchTcgPrice(
  name: string,
  set: string | null,
  number: string | null,
  rarity: string | null,
  variantHint: string | null,
) {
  // Use wildcard so "Charizard" still matches "Charizard ex" / "Charizard VMAX".
  // When we have a card number, drop the wildcard and require exact number+name
  // (number is by far the most selective filter — eliminates reprints).
  const cleanName = name.replace(/"/g, "");
  const parts: string[] = [];
  if (number) {
    parts.push(`name:"${cleanName}*"`);
    parts.push(`number:"${number.replace(/"/g, "").split("/")[0].trim()}"`);
  } else {
    parts.push(`name:"${cleanName}*"`);
  }
  if (set) parts.push(`set.name:"${set.replace(/"/g, "")}*"`);
  const q = parts.join(" ");
  const apiKey = Deno.env.get("POKEMONTCG_API_KEY");
  // Pull up to 20 candidates so we can rank by closest name + rarity match.
  // Without an explicit order we let the API's relevance ranking surface the
  // best name match first instead of forcing newest-set first.
  const res = await fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&pageSize=20`, {
    headers: apiKey ? { "X-Api-Key": apiKey } : {},
  });
  if (!res.ok) return null;
  const json = await res.json();
  const candidates: any[] = json?.data || [];
  if (candidates.length === 0) return null;

  // Score candidates: exact name match > prefix match; rarity match adds points;
  // having a tcgplayer market price is required to be useful.
  const targetName = cleanName.toLowerCase();
  const targetRarity = (rarity || "").toLowerCase();
  function score(c: any): number {
    let s = 0;
    const cn = (c.name || "").toLowerCase();
    if (cn === targetName) s += 10;
    else if (cn.startsWith(targetName)) s += 4;
    if (targetRarity && (c.rarity || "").toLowerCase() === targetRarity) s += 5;
    else if (targetRarity && (c.rarity || "").toLowerCase().includes(targetRarity.split(" ")[0])) s += 2;
    if (c?.tcgplayer?.prices) s += 3; // has pricing data
    return s;
  }
  candidates.sort((a, b) => score(b) - score(a));

  // Top-scored candidate is the best match (already ranked by name + rarity + has-prices).
  const card = candidates[0];

  const p = card?.tcgplayer?.prices ?? {};
  // Choose the variant that matches the scanned card's actual variant/rarity
  const want = (variantHint || rarity || "").toLowerCase();
  let variant: any = null;
  let variantKey = "normal";
  if (/reverse/.test(want)) { variant = p.reverseHolofoil; variantKey = "reverseHolofoil"; }
  else if (/1st\s*edition/.test(want) && p["1stEditionHolofoil"]) { variant = p["1stEditionHolofoil"]; variantKey = "1stEditionHolofoil"; }
  else if (/holo|rare\s*holo|ultra|secret|illustration|amazing/.test(want)) { variant = p.holofoil ?? p.unlimitedHolofoil; variantKey = "holofoil"; }
  else { variant = p.normal ?? p.unlimitedHolofoil; variantKey = "normal"; }
  // Final fallback chain — never just default to holofoil for non-holo cards
  if (!variant) variant = p.normal ?? p.reverseHolofoil ?? p.holofoil ?? p["1stEditionHolofoil"] ?? p.unlimitedHolofoil ?? null;
  if (!variant) return null;

  const market = variant.market ?? variant.mid ?? null;
  if (market == null) return null;

  return {
    market,
    low: variant.low ?? null,
    high: variant.high ?? null,
    mid: variant.mid ?? null,
    source: "TCGPlayer (Pokémon TCG API)",
    source_url: card?.tcgplayer?.url ?? null,
    raw: { tcgplayer: card?.tcgplayer ?? null, cardId: card.id, variantKey, matchedRarity: card.rarity },
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

  let identities: { name: string; set: string | null; number: string | null; rarity: string | null; variant: string | null }[] = [];

  if (singleName) {
    identities = [{
      name: singleName,
      set: url.searchParams.get("set"),
      number: url.searchParams.get("number"),
      rarity: url.searchParams.get("rarity"),
      variant: url.searchParams.get("variant"),
    }];
  } else {
    const { data: vc } = await supabase
      .from("vault_cards")
      .select("name, tcg_set, tcg_number")
      .eq("price_locked", false)
      .eq("status", "active")
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

    const { data: vaultRows } = await supabase
      .from("vault_cards")
      .update(update)
      .eq("name", id.name)
      .eq("price_locked", false)
      .eq("status", "active")
      .or(`tcg_set.eq.${id.set ?? ""},tcg_set.is.null`)
      .select("id, user_id, estimated_value");

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
