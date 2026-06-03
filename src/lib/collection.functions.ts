// PullBid Live — Collection Tracking (Priority 2).
// "Collection Books" group a user's vaulted cards by set so they can see
// progress (e.g. Base Set 97/102) and a Missing Card Finder that surfaces
// where to buy / trade for the cards they still need.
// Derived entirely from existing tables (vault_cards, card_identities, listings) — no schema changes, real cards are never at risk.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const norm = (v: unknown) => String(v ?? "").trim();
const normNum = (v: unknown) => norm(v).replace(/^0+(?=\d)/, "").toLowerCase();

type BookCard = {
  number: string;
  name: string;
  image_url: string | null;
  value: number;
  rarity: string | null;
};

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
      ownedNumbers: Set<string>;
      ownedCount: number;
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
      if (number) b.ownedNumbers.add(number);
      if (!b.cover && img) b.cover = img;
    }

    // Known set totals: distinct card numbers seen across all collectors.
    const setNames = [...new Set([...books.values()].map((b) => b.setName))].filter((s) => s && s !== "Other Cards");
    const knownTotals = new Map<string, Set<string>>();
    for (let i = 0; i < setNames.length; i += 50) {
      const slice = setNames.slice(i, i + 50);
      const { data: idents } = await supabaseAdmin
        .from("card_identities")
        .select("set_name, number")
        .in("set_name", slice)
        .limit(8000);
      (idents ?? []).forEach((d) => {
        const sn = norm(d.set_name).toLowerCase();
        const n = normNum(d.number);
        if (!n) return;
        if (!knownTotals.has(sn)) knownTotals.set(sn, new Set());
        knownTotals.get(sn)!.add(n);
      });
    }

    const result = [...books.values()].map((b) => {
      const known = knownTotals.get(b.setName.toLowerCase());
      const knownTotal = known ? Math.max(known.size, b.ownedNumbers.size) : 0;
      return {
        key: b.key,
        setName: b.setName,
        category: b.category,
        ownedCount: b.ownedCount,
        ownedDistinct: b.ownedNumbers.size,
        knownTotal,
        completion: knownTotal > 0 ? Math.min(100, Math.round((b.ownedNumbers.size / knownTotal) * 100)) : null,
        totalValueCents: Math.round(b.totalValue * 100),
        cover: b.cover,
      };
    });

    result.sort((a, b) => b.ownedCount - a.ownedCount);
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

    // Universe of cards known to exist in this set.
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

    // What the user owns in this set.
    const { data: mine } = await supabaseAdmin
      .from("vault_cards")
      .select("name, tcg_number, image_url, estimated_value, market_price")
      .eq("user_id", userId)
      .eq("is_sold", false)
      .eq("tcg_set", setName)
      .limit(3000);
    const ownedNums = new Set((mine ?? []).map((m) => normNum(m.tcg_number)).filter(Boolean));

    const owned: BookCard[] = [];
    const missing: BookCard[] = [];
    for (const [n, card] of byNumber) {
      if (ownedNums.has(n)) owned.push(card);
      else missing.push(card);
    }

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

    const knownTotal = byNumber.size;
    return {
      setName,
      category: data.category,
      knownTotal,
      ownedCount: owned.length,
      completion: knownTotal > 0 ? Math.min(100, Math.round((owned.length / knownTotal) * 100)) : null,
      owned,
      missing: missingWithAvail,
    };
  });
