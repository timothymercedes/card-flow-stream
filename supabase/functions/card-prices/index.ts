// Fetch + cache Pokémon card prices from the free Pokémon TCG API.
// GET ?id=<pokemon_cards.id>  → returns cached row, refreshing if stale > 24h.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STALE_MS = 24 * 60 * 60 * 1000;

function pickTrend(prices: any): string {
  // crude heuristic on tcgplayer holofoil/normal trend
  const market = prices?.holofoil?.market ?? prices?.normal?.market ?? prices?.reverseHolofoil?.market ?? null;
  const low = prices?.holofoil?.low ?? prices?.normal?.low ?? null;
  if (!market) return "Stable Demand 📊";
  if (low && market > low * 1.25) return "Trending Up 📈";
  if (market > 50) return "Hot Right Now 🔥";
  if (market > 100) return "Rare Find 💎";
  return "Stable Demand 📊";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return new Response(JSON.stringify({ error: "missing id" }), { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: existing } = await supabase.from("pokemon_cards").select("*").eq("id", id).maybeSingle();
    const fresh = existing?.prices_updated_at && (Date.now() - new Date(existing.prices_updated_at).getTime()) < STALE_MS;
    if (existing && fresh) {
      return new Response(JSON.stringify({ card: existing, cached: true }), { headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    // Fetch from Pokémon TCG API
    const apiKey = Deno.env.get("POKEMONTCG_API_KEY");
    const res = await fetch(`https://api.pokemontcg.io/v2/cards/${encodeURIComponent(id)}`, {
      headers: apiKey ? { "X-Api-Key": apiKey } : {},
    });
    if (!res.ok) {
      if (existing) return new Response(JSON.stringify({ card: existing, cached: true, stale: true }), { headers: { ...corsHeaders, "content-type": "application/json" } });
      return new Response(JSON.stringify({ error: "card not found" }), { status: 404, headers: { ...corsHeaders, "content-type": "application/json" } });
    }
    const { data: card } = await res.json();
    const prices = card?.tcgplayer?.prices ?? {};
    const tcgMarket = prices?.holofoil?.market ?? prices?.normal?.market ?? prices?.reverseHolofoil?.market ?? prices?.["1stEditionHolofoil"]?.market ?? null;
    const row = {
      id: card.id as string,
      name: card.name,
      set_name: card.set?.name ?? null,
      set_code: card.set?.id ?? null,
      number: card.number ?? null,
      rarity: card.rarity ?? null,
      year: card.set?.releaseDate ? String(card.set.releaseDate).slice(0, 4) : null,
      is_holo: !!prices?.holofoil,
      is_reverse_holo: !!prices?.reverseHolofoil,
      subtypes: card.subtypes ?? null,
      image_small: card.images?.small ?? null,
      image_large: card.images?.large ?? null,
      tcgplayer_price: tcgMarket,
      last_sold_price: tcgMarket,
      trend: pickTrend(prices),
      prices_updated_at: new Date().toISOString(),
      raw: card,
    };
    await supabase.from("pokemon_cards").upsert(row, { onConflict: "id" });
    return new Response(JSON.stringify({ card: row, cached: false }), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
});
