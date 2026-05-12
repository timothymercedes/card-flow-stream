// Daily sync from tcgcsv.com (free daily snapshots of TCGplayer prices)
// covering games without a free public search API: One Piece, Lorcana,
// Dragon Ball Super Fusion World, Star Wars Unlimited, Flesh and Blood.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// TCGplayer category IDs (stable, sourced from tcgcsv.com/tcgplayer/categories)
const GAMES: Array<{ game: string; categoryId: number }> = [
  { game: "One Piece", categoryId: 68 },
  { game: "Lorcana", categoryId: 71 },
  { game: "Dragon Ball Super Fusion", categoryId: 85 },
  { game: "Star Wars Unlimited", categoryId: 79 },
  { game: "Flesh and Blood", categoryId: 62 },
];

function cleanName(s: string) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchJson(url: string): Promise<any> {
  const r = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "PullBidLive/1.0 (contact@pullbidlive.com)",
    },
  });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
}

async function syncGame(game: string, categoryId: number) {
  const groupsRes = await fetchJson(`https://tcgcsv.com/tcgplayer/${categoryId}/groups`);
  const groups: any[] = groupsRes?.results || groupsRes?.data || [];
  let upserted = 0;

  for (const g of groups) {
    const groupId = g.groupId || g.id;
    if (!groupId) continue;
    try {
      const [productsRes, pricesRes] = await Promise.all([
        fetchJson(`https://tcgcsv.com/tcgplayer/${categoryId}/${groupId}/products`),
        fetchJson(`https://tcgcsv.com/tcgplayer/${categoryId}/${groupId}/prices`),
      ]);
      const products: any[] = productsRes?.results || productsRes?.data || [];
      const prices: any[] = pricesRes?.results || pricesRes?.data || [];
      const priceByPid = new Map<number, any>();
      for (const p of prices) {
        // tcgcsv lists multiple sub-types (Normal, Foil, etc.) — keep first/highest market
        const pid = Number(p.productId);
        const existing = priceByPid.get(pid);
        if (!existing || Number(p.marketPrice || 0) > Number(existing.marketPrice || 0)) {
          priceByPid.set(pid, p);
        }
      }

      const rows = products
        .map((p) => {
          const pid = Number(p.productId);
          const price = priceByPid.get(pid) || {};
          // Pull number/rarity from extendedData
          let number: string | null = null;
          let rarity: string | null = null;
          const extras = Array.isArray(p.extendedData) ? p.extendedData : [];
          for (const ex of extras) {
            const n = String(ex.name || "").toLowerCase();
            if (n === "number") number = String(ex.value || "");
            else if (n === "rarity") rarity = String(ex.value || "");
          }
          return {
            game,
            tcgplayer_product_id: pid,
            name: String(p.name || "").trim(),
            clean_name: cleanName(p.cleanName || p.name || ""),
            set_name: String(g.name || ""),
            number,
            rarity,
            image_url: p.imageUrl || null,
            market_price: Number(price.marketPrice) || null,
            low_price: Number(price.lowPrice) || null,
            mid_price: Number(price.midPrice) || null,
            high_price: Number(price.highPrice) || null,
            updated_at: new Date().toISOString(),
          };
        })
        .filter((r) => r.tcgplayer_product_id && r.name);

      if (!rows.length) continue;
      // Chunk upserts (Supabase default body limit)
      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK);
        const { error } = await supabaseAdmin
          .from("tcg_prices")
          .upsert(slice, { onConflict: "game,tcgplayer_product_id" });
        if (error) console.error(`upsert ${game} group ${groupId}:`, error.message);
        else upserted += slice.length;
      }
    } catch (e: any) {
      console.error(`sync ${game} group ${groupId} failed:`, e?.message || e);
    }
  }
  return upserted;
}

export const Route = createFileRoute("/api/public/hooks/sync-tcgcsv")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Light auth: require anon key in apikey header (pg_cron pattern)
        const apikey = request.headers.get("apikey");
        if (!apikey || apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const results: Record<string, number | string> = {};
        for (const g of GAMES) {
          try {
            results[g.game] = await syncGame(g.game, g.categoryId);
          } catch (e: any) {
            results[g.game] = `error: ${e?.message || e}`;
          }
        }
        return new Response(JSON.stringify({ success: true, results }), {
          headers: { "Content-Type": "application/json" },
        });
      },
      GET: async () => new Response("OK"),
    },
  },
});
