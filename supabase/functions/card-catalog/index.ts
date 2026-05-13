// Unified card catalog lookup. Game-aware: routes through the per-game
// adapter chain declared in _shared/cards/games.ts (Pokémon, Yu-Gi-Oh, MTG,
// One Piece, Lorcana, DBSFW, SWU, FaB, …). Pokémon also gets the local
// `pokemon_cards` cache prepended.
//
// POST { name, number?, set?, game?, limit? } → { candidates, chosen, sources_tried, game }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { NormalizedCard } from "../_shared/cards/sources.ts";
import { resolveGame, listGames } from "../_shared/cards/games.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function norm(s: string | null | undefined) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function scoreCandidate(c: NormalizedCard, q: { name?: string; number?: string; set?: string }) {
  let s = 0;
  if (q.name) {
    const a = norm(c.name), b = norm(q.name);
    if (a === b) s += 50;
    else if (a.startsWith(b) || b.startsWith(a)) s += 35;
    else if (a.includes(b) || b.includes(a)) s += 20;
  }
  if (q.number) {
    const cn = String(c.number || "").split("/")[0].trim().replace(/^0+(\d)/, "$1");
    const qn = String(q.number).split("/")[0].trim().replace(/^0+(\d)/, "$1");
    if (cn && cn === qn) s += 30;
  }
  if (q.set) {
    const a = norm(c.set_name), b = norm(q.set);
    if (a === b) s += 20;
    else if (a.includes(b) || b.includes(a)) s += 10;
  }
  // prefer cards with images
  if (c.image_small || c.image_large) s += 2;
  return s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const t0 = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.list_games) {
      return new Response(JSON.stringify({ games: listGames() }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }
    const name = String(body?.name || "").trim();
    const number = body?.number ? String(body.number).trim() : "";
    const set = body?.set ? String(body.set).trim() : "";
    const limit = Math.min(Math.max(Number(body?.limit) || 8, 1), 20);
    const game = resolveGame(body?.game);
    if (!name && !number) {
      return new Response(JSON.stringify({ error: "name or number required" }), {
        status: 400, headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const sourcesTried: string[] = [];
    const candidates: NormalizedCard[] = [];

    // 1) Local Pokémon cache (only meaningful for game=pokemon).
    if (game.id === "pokemon") {
      sourcesTried.push("local");
      let local = admin.from("pokemon_cards")
        .select("id,name,set_name,set_code,number,rarity,year,image_small,image_large,raw,source_ids")
        .limit(limit);
      if (name) local = local.ilike("name", `%${name}%`);
      if (number) {
        const n = number.split("/")[0].trim().replace(/^0+(\d)/, "$1");
        local = local.eq("number", n);
      }
      const { data: localRows } = await local;
      for (const r of localRows ?? []) {
        candidates.push({
          id: r.id, source: "local",
          source_ids: (r.source_ids as Record<string, string>) || { tcg_api: r.id },
          name: r.name, set_name: r.set_name, set_code: r.set_code,
          number: r.number, rarity: r.rarity, year: r.year,
          image_small: r.image_small, image_large: r.image_large,
          variants: [], raw: r.raw,
        });
      }
    }

    // 2) Game-specific adapter chain. First adapter is primary; subsequent
    //    adapters only run if no candidate scores >= 70 yet.
    for (const adapter of game.catalog) {
      const bestSoFar = candidates
        .map((c) => ({ c, s: scoreCandidate(c, { name, number, set }) }))
        .sort((a, b) => b.s - a.s)[0];
      if (bestSoFar && bestSoFar.s >= 70 && sourcesTried.length > 1) break;
      sourcesTried.push(adapter.id);
      try {
        const rows = await adapter.search({ name, number, set, limit });
        candidates.push(...rows);
      } catch (e) {
        console.warn(`[card-catalog] adapter ${adapter.id} failed:`, (e as Error)?.message);
      }
    }


    // Dedupe by id, keep best-scoring instance
    const byId = new Map<string, { c: NormalizedCard; s: number }>();
    for (const c of candidates) {
      const s = scoreCandidate(c, { name, number, set });
      const prev = byId.get(c.id);
      if (!prev || s > prev.s) byId.set(c.id, { c, s });
    }
    const ranked = [...byId.values()].sort((a, b) => b.s - a.s);
    const top = ranked.slice(0, limit);
    const chosen = top[0]?.s >= 60 ? top[0].c : null;

    // Best-effort: upsert remote Pokémon results into local cache
    // (other games are cached via tcg_prices / per-game tables, not pokemon_cards).
    if (game.id === "pokemon") {
      const newRows = top
        .filter(({ c }) => c.source !== "local" && c.source !== "tcg_prices")
        .map(({ c }) => ({
          id: c.id, name: c.name, set_name: c.set_name, set_code: c.set_code,
          number: c.number, rarity: c.rarity, year: c.year,
          image_small: c.image_small, image_large: c.image_large,
          source: c.source, source_ids: c.source_ids,
          last_seen_at: new Date().toISOString(), raw: c.raw,
        }));
      if (newRows.length) {
        admin.from("pokemon_cards").upsert(newRows, { onConflict: "id" })
          .then(({ error }) => { if (error) console.warn("catalog upsert", error.message); });
      }
    }

    return new Response(JSON.stringify({
      game: game.id,
      candidates: top.map(({ c, s }) => ({ ...c, _score: s })),
      chosen,
      sources_tried: sourcesTried,
      duration_ms: Date.now() - t0,
    }), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (e) {
    console.error("card-catalog", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
