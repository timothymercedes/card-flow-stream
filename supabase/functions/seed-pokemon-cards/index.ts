// Admin-triggered seed of pokemon_cards from the free Pokémon TCG API.
// POST { set?: string, query?: string, pages?: number }  → upserts up to pages*250 cards.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("authorization");
    if (!auth) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    const { data: isOwner } = await supabase.rpc("has_role", { _user_id: user.id, _role: "owner" });
    if (!isAdmin && !isOwner) return new Response("Forbidden", { status: 403, headers: corsHeaders });

    const body = await req.json().catch(() => ({}));
    const setId: string | undefined = body.set;
    const query: string | undefined = body.query;
    const pages: number = Math.min(Math.max(Number(body.pages || 1), 1), 20);

    const apiKey = Deno.env.get("POKEMONTCG_API_KEY");
    const q = setId ? `set.id:${setId}` : (query || "supertype:Pokémon");
    let total = 0;
    for (let page = 1; page <= pages; page++) {
      const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&page=${page}&pageSize=250&orderBy=set.releaseDate,number`;
      const r = await fetch(url, { headers: apiKey ? { "X-Api-Key": apiKey } : {} });
      if (!r.ok) break;
      const { data } = await r.json();
      if (!Array.isArray(data) || data.length === 0) break;
      const rows = data.map((card: any) => {
        const prices = card?.tcgplayer?.prices ?? {};
        const tcgMarket = prices?.holofoil?.market ?? prices?.normal?.market ?? prices?.reverseHolofoil?.market ?? null;
        return {
          id: card.id,
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
          trend: tcgMarket && tcgMarket > 50 ? "Hot Right Now 🔥" : "Stable Demand 📊",
          prices_updated_at: new Date().toISOString(),
          raw: card,
        };
      });
      const { error } = await supabase.from("pokemon_cards").upsert(rows, { onConflict: "id" });
      if (error) throw error;
      total += rows.length;
      if (data.length < 250) break;
    }

    return new Response(JSON.stringify({ ok: true, inserted: total }), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
});
