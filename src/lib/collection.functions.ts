// PullBid Live — Collection Tracking (Priority 2).
// "Collection Books" group a user's vaulted cards by set so they can see
// TRUE set completion (e.g. Team Rocket 3/83) against the official set size,
// and a Missing Card Finder that surfaces where to buy / trade for the cards
// they still need.
//
// Completion is measured against the official total number of cards in a set,
// sourced from the public `card_sets` master table (seeded from the Pokémon
// TCG checklist). When a set is not in the master table we fall back to the
// distinct numbers seen across all collectors (a conservative proxy).
//
// Unique card counting: completion only ever counts DISTINCT card numbers a
// user owns, so duplicates never inflate progress.
//
// Derived from existing tables (vault_cards, card_identities, listings) plus
// the card_sets reference table — no user data is ever mutated.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const norm = (v: unknown) => String(v ?? "").trim();
const normNum = (v: unknown) => norm(v).replace(/^0+(?=\d)/, "").toLowerCase();
const normSet = (v: unknown) => norm(v).toLowerCase();

type BookCard = {
  number: string;
  name: string;
  image_url: string | null;
  value: number;
  rarity: string | null;
};

import { normalizeTcgCategory } from "@/lib/tcgCategory";

// Look up official set totals from the card_sets master table, keyed by
// canonical game category + set name so cross-game name collisions never
// cross-contaminate (e.g. a Pokémon "Dragon" set vs an MTG one).
async function loadSetTotals(
  supabaseAdmin: any,
  pairs: { category: string; setName: string }[],
): Promise<Map<string, number>> {
  const totals = new Map<string, number>(); // key: `${cat}|||${lowerSetName}`
  const names = [...new Set(pairs.map((p) => norm(p.setName)).filter(Boolean))];
  for (let i = 0; i < names.length; i += 100) {
    const slice = names.slice(i, i + 100);
    const { data } = await supabaseAdmin
      .from("card_sets")
      .select("category, set_name, total, printed_total")
      .in("set_name", slice);
    (data ?? []).forEach((r: any) => {
      const total = Number(r.total) || Number(r.printed_total) || 0;
      if (total <= 0) return;
      totals.set(`${normalizeTcgCategory(r.category)}|||${normSet(r.set_name)}`, total);
    });
  }
  return totals;
}

function setTotalKey(category: unknown, setName: unknown) {
  return `${normalizeTcgCategory(category)}|||${normSet(setName)}`;
}


// ---------- Collection Books overview ----------
export const getCollectionBooks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: cards, error } = await supabaseAdmin
      .from("vault_cards")
      .select("id, name, image_url, estimated_value, market_price, category, tcg_set, tcg_number, card_identity_id")
      .eq("user_id", userId)
      .eq("is_sold", false)
      .eq("is_demo", false)
      .limit(3000);
    if (error) throw new Error(error.message);
    const rows = cards ?? [];

    // Pull identity info for cards that have it (more reliable set names).
    const identityIds = [...new Set(rows.map((r) => r.card_identity_id).filter(Boolean))] as string[];
    const idMap = new Map<string, any>();
    for (let i = 0; i < identityIds.length; i += 300) {
      const slice = identityIds.slice(i, i + 300);
      const { data: ids } = await supabaseAdmin
        .from("card_identities")
        .select("id, set_name, set_code, number, category, image_url")
        .in("id", slice);
      (ids ?? []).forEach((d) => idMap.set(d.id, d));
    }

    type Book = {
      key: string;
      setName: string;
      category: string;
      ownedNumbers: Set<string>; // distinct numbers — unique counting
      ownedCount: number; // total copies (incl. duplicates)
      totalValue: number;
      cover: string | null;
    };
    const books = new Map<string, Book>();

    for (const c of rows) {
      const ident = c.card_identity_id ? idMap.get(c.card_identity_id) : null;
      const setName = norm(ident?.set_name) || norm(c.tcg_set) || "Other Cards";
      const category = norm(ident?.category) || norm(c.category) || "Uncategorized";
      const key = `${category}|||${setName.toLowerCase()}`;
      const number = normNum(ident?.number ?? c.tcg_number);
      const value = Number(c.market_price ?? c.estimated_value ?? 0);
      const img = c.image_url || ident?.image_url || null;

      let b = books.get(key);
      if (!b) {
        b = { key, setName, category, ownedNumbers: new Set(), ownedCount: 0, totalValue: 0, cover: null };
        books.set(key, b);
      }
      b.ownedCount += 1;
      b.totalValue += value;
      if (number) b.ownedNumbers.add(number); // duplicates collapse here
      if (!b.cover && img) b.cover = img;
    }

    const setNames = [...books.values()].map((b) => b.setName).filter((s) => s && s !== "Other Cards");

    // Official set sizes (primary source of truth).
    const officialTotals = await loadSetTotals(supabaseAdmin, setNames);

    // Fallback proxy: distinct numbers seen across all collectors, used only
    // when a set isn't in the master checklist table.
    const proxyTotals = new Map<string, Set<string>>();
    const unknownSets = [...new Set(setNames.map(normSet))].filter((s) => !officialTotals.has(s));
    const unknownOriginal = [...new Set(setNames)].filter((s) => unknownSets.includes(normSet(s)));
    for (let i = 0; i < unknownOriginal.length; i += 50) {
      const slice = unknownOriginal.slice(i, i + 50);
      const { data: idents } = await supabaseAdmin
        .from("card_identities")
        .select("set_name, number")
        .in("set_name", slice)
        .limit(8000);
      (idents ?? []).forEach((d) => {
        const sn = normSet(d.set_name);
        const n = normNum(d.number);
        if (!n) return;
        if (!proxyTotals.has(sn)) proxyTotals.set(sn, new Set());
        proxyTotals.get(sn)!.add(n);
      });
    }

    const result = [...books.values()].map((b) => {
      const sn = normSet(b.setName);
      const official = officialTotals.get(sn) ?? 0;
      const proxy = proxyTotals.get(sn)?.size ?? 0;
      // Always at least as large as what the user owns distinctly.
      const knownTotal = Math.max(official || proxy, b.ownedNumbers.size);
      const hasTotal = knownTotal > 0 && (official > 0 || proxy > 0);
      return {
        key: b.key,
        setName: b.setName,
        category: b.category,
        ownedCount: b.ownedCount,
        ownedDistinct: b.ownedNumbers.size,
        knownTotal: hasTotal ? knownTotal : 0,
        official: official > 0,
        completion: hasTotal ? Math.min(100, Math.round((b.ownedNumbers.size / knownTotal) * 100)) : null,
        totalValueCents: Math.round(b.totalValue * 100),
        cover: b.cover,
      };
    });

    result.sort((a, b) => {
      // Sets with real completion data first, then by progress, then size.
      const ac = a.completion ?? -1;
      const bc = b.completion ?? -1;
      if (bc !== ac) return bc - ac;
      return b.ownedDistinct - a.ownedDistinct;
    });
    return { books: result };
  });

// ---------- Single book detail + Missing Card Finder ----------
export const getCollectionBookDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ setName: z.string().min(1).max(200), category: z.string().min(1).max(80) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const setName = data.setName;

    // Official total cards in this set (source of truth for completion).
    const officialTotals = await loadSetTotals(supabaseAdmin, [setName]);
    const officialTotal = officialTotals.get(normSet(setName)) ?? 0;

    // Universe of cards known to exist in this set (for showing images/names
    // of missing cards we have catalog data for).
    const { data: universe } = await supabaseAdmin
      .from("card_identities")
      .select("id, name, number, image_url, market_value_cents, rarity")
      .eq("set_name", setName)
      .limit(5000);
    const uni = (universe ?? []).filter((u) => normNum(u.number));

    // Dedupe by number, keep richest entry.
    const byNumber = new Map<string, BookCard>();
    for (const u of uni) {
      const n = normNum(u.number);
      const existing = byNumber.get(n);
      const card: BookCard = {
        number: norm(u.number),
        name: norm(u.name),
        image_url: u.image_url ?? null,
        value: Number(u.market_value_cents ?? 0) / 100,
        rarity: u.rarity ?? null,
      };
      if (!existing || (!existing.image_url && card.image_url)) byNumber.set(n, card);
    }

    // What the user owns in this set (distinct numbers — unique counting).
    const { data: mine } = await supabaseAdmin
      .from("vault_cards")
      .select("name, tcg_number, image_url, estimated_value, market_price")
      .eq("user_id", userId)
      .eq("is_sold", false)
      .eq("tcg_set", setName)
      .limit(3000);
    const myCards = mine ?? [];
    const ownedNums = new Set(myCards.map((m) => normNum(m.tcg_number)).filter(Boolean));

    const owned: BookCard[] = [];
    const missing: BookCard[] = [];
    for (const [n, card] of byNumber) {
      if (ownedNums.has(n)) owned.push(card);
      else missing.push(card);
    }

    // True completion is measured against the official set size when known.
    // catalogTotal = number of cards we have catalog rows for (used as a proxy
    // when no official size exists).
    const catalogTotal = byNumber.size;
    const knownTotal = Math.max(officialTotal || catalogTotal, ownedNums.size);
    const hasTotal = knownTotal > 0 && (officialTotal > 0 || catalogTotal > 0);

    // Number of distinct cards the user is still missing toward the full set.
    const distinctMissingCount = hasTotal ? Math.max(0, knownTotal - ownedNums.size) : missing.length;

    // Availability for missing cards: active marketplace listings + tradeable
    // copies owned by other collectors, matched on card number within the set.
    const nowIso = new Date().toISOString();
    const [{ data: listings }, { data: tradeables }] = await Promise.all([
      supabaseAdmin
        .from("listings")
        .select("tcg_number, is_auction, price, buy_now_price")
        .eq("tcg_set", setName)
        .eq("is_demo", false)
        .gt("expires_at", nowIso)
        .limit(2000),
      supabaseAdmin
        .from("vault_cards")
        .select("tcg_number")
        .eq("tcg_set", setName)
        .eq("is_sold", false)
        .neq("user_id", userId)
        .or("accept_trades.eq.true,trade_plus_cash.eq.true,accept_offers.eq.true")
        .limit(2000),
    ]);

    const forSale = new Map<string, number>();
    (listings ?? []).forEach((l) => {
      const n = normNum(l.tcg_number);
      if (!n) return;
      forSale.set(n, (forSale.get(n) ?? 0) + 1);
    });
    const forTrade = new Map<string, number>();
    (tradeables ?? []).forEach((v) => {
      const n = normNum(v.tcg_number);
      if (!n) return;
      forTrade.set(n, (forTrade.get(n) ?? 0) + 1);
    });

    const missingWithAvail = missing
      .map((c) => {
        const n = normNum(c.number);
        return {
          ...c,
          listingsCount: forSale.get(n) ?? 0,
          tradeCount: forTrade.get(n) ?? 0,
        };
      })
      .sort((a, b) => {
        const aa = (a.listingsCount > 0 ? 2 : 0) + (a.tradeCount > 0 ? 1 : 0);
        const bb = (b.listingsCount > 0 ? 2 : 0) + (b.tradeCount > 0 ? 1 : 0);
        if (bb !== aa) return bb - aa;
        return (Number(a.number) || 0) - (Number(b.number) || 0);
      });

    owned.sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));

    return {
      setName,
      category: data.category,
      knownTotal: hasTotal ? knownTotal : 0,
      official: officialTotal > 0,
      ownedCount: ownedNums.size, // distinct cards owned (unique counting)
      ownedCopies: myCards.length, // total copies incl. duplicates
      catalogCount: catalogTotal, // cards we have catalog images for
      distinctMissingCount,
      completion: hasTotal ? Math.min(100, Math.round((ownedNums.size / knownTotal) * 100)) : null,
      owned,
      missing: missingWithAvail,
    };
  });
