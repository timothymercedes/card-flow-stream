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


// ---------- Core computation (reusable by rewards engine) ----------
// Minimum distinct cards a grouping must have to be treated as a real,
// trackable release set. Anything smaller (1-2 cards) that has no official
// total is a promo/showcase grouping, not a standard Collection Book set.
const MIN_SET_SIZE = 10;

// How a Collection Book is classified:
//  - "set"     : official release set or recognized subset (has a real total)
//  - "promo"   : single-card grouping (promo / one-off)
//  - "special" : small non-official grouping (showcase / special collection)
export type BookKind = "set" | "promo" | "special";

export type CollectionBook = {
  key: string;
  setName: string;
  category: string;
  kind: BookKind;
  ownedCount: number;
  ownedDistinct: number;
  knownTotal: number;
  official: boolean;
  completion: number | null;
  totalValueCents: number;
  cover: string | null;
  complete: boolean;
};

// Decide whether a grouping is a real set and how it should be classified.
function classifyBook(args: {
  official: number;
  proxyOrCatalog: number;
  ownedDistinct: number;
  ownedCount: number;
}): { isSet: boolean; realTotal: number; kind: BookKind } {
  const { official, proxyOrCatalog, ownedDistinct, ownedCount } = args;
  // A real total exists only with an official count, or a substantial
  // catalog/proxy size. Tiny groupings never inherit "owned" as their total.
  const realTotal = official > 0 ? official : proxyOrCatalog >= MIN_SET_SIZE ? proxyOrCatalog : 0;
  if (realTotal > 0) return { isSet: true, realTotal, kind: "set" };
  const kind: BookKind = ownedDistinct <= 1 && ownedCount <= 1 ? "promo" : "special";
  return { isSet: false, realTotal: 0, kind };
}

export async function computeCollectionBooks(
  supabaseAdmin: any,
  userId: string,
): Promise<CollectionBook[]> {
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
  const identityIds = [...new Set(rows.map((r: any) => r.card_identity_id).filter(Boolean))] as string[];
  const idMap = new Map<string, any>();
  for (let i = 0; i < identityIds.length; i += 300) {
    const slice = identityIds.slice(i, i + 300);
    const { data: ids } = await supabaseAdmin
      .from("card_identities")
      .select("id, set_name, set_code, number, category, image_url")
      .in("id", slice);
    (ids ?? []).forEach((d: any) => idMap.set(d.id, d));
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

  const bookList = [...books.values()].filter((b) => b.setName && b.setName !== "Other Cards");

  const officialTotals = await loadSetTotals(
    supabaseAdmin,
    bookList.map((b) => ({ category: b.category, setName: b.setName })),
  );

  const proxyTotals = new Map<string, Set<string>>();
  const unknownBooks = bookList.filter((b) => !officialTotals.has(setTotalKey(b.category, b.setName)));
  const unknownOriginal = [...new Set(unknownBooks.map((b) => b.setName))];
  for (let i = 0; i < unknownOriginal.length; i += 50) {
    const slice = unknownOriginal.slice(i, i + 50);
    const { data: idents } = await supabaseAdmin
      .from("card_identities")
      .select("set_name, number")
      .in("set_name", slice)
      .limit(8000);
    (idents ?? []).forEach((d: any) => {
      const sn = normSet(d.set_name);
      const n = normNum(d.number);
      if (!n) return;
      if (!proxyTotals.has(sn)) proxyTotals.set(sn, new Set());
      proxyTotals.get(sn)!.add(n);
    });
  }

  const result: CollectionBook[] = [...books.values()].map((b) => {
    const official = officialTotals.get(setTotalKey(b.category, b.setName)) ?? 0;
    const proxy = proxyTotals.get(normSet(b.setName))?.size ?? 0;
    const { isSet, realTotal, kind } = classifyBook({
      official,
      proxyOrCatalog: proxy,
      ownedDistinct: b.ownedNumbers.size,
      ownedCount: b.ownedCount,
    });
    // Only real sets get a completion %; promo/special groupings never show
    // a fake "X/X complete".
    const knownTotal = isSet ? Math.max(realTotal, b.ownedNumbers.size) : 0;
    const completion = isSet ? Math.min(100, Math.round((b.ownedNumbers.size / knownTotal) * 100)) : null;
    // True completion requires an official total AND owning every distinct card.
    const complete = official > 0 && b.ownedNumbers.size >= official;
    return {
      key: b.key,
      setName: b.setName,
      category: b.category,
      kind,
      ownedCount: b.ownedCount,
      ownedDistinct: b.ownedNumbers.size,
      knownTotal,
      official: official > 0,
      completion,
      totalValueCents: Math.round(b.totalValue * 100),
      cover: b.cover,
      complete,
    };
  });

  result.sort((a, b) => {
    const ac = a.completion ?? -1;
    const bc = b.completion ?? -1;
    if (bc !== ac) return bc - ac;
    return b.ownedDistinct - a.ownedDistinct;
  });
  return result;
}

// ---------- Collection Books overview ----------
export const getCollectionBooks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const books = await computeCollectionBooks(supabaseAdmin, userId);
    return { books };
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
    const officialTotals = await loadSetTotals(supabaseAdmin, [{ category: data.category, setName }]);
    const officialTotal = officialTotals.get(setTotalKey(data.category, setName)) ?? 0;

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
    // when no official size exists, but only when it's a substantial set).
    const catalogTotal = byNumber.size;
    const { isSet, realTotal, kind } = classifyBook({
      official: officialTotal,
      proxyOrCatalog: catalogTotal,
      ownedDistinct: ownedNums.size,
      ownedCount: myCards.length,
    });
    const knownTotal = isSet ? Math.max(realTotal, ownedNums.size) : 0;
    const hasTotal = isSet;

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
      setKey: setTotalKey(data.category, setName),
      kind,
      knownTotal: hasTotal ? knownTotal : 0,
      official: officialTotal > 0,
      ownedCount: ownedNums.size, // distinct cards owned (unique counting)
      ownedCopies: myCards.length, // total copies incl. duplicates
      catalogCount: catalogTotal, // cards we have catalog images for
      distinctMissingCount,
      // True 100% completion: official size known AND every distinct card owned.
      complete: officialTotal > 0 && ownedNums.size >= officialTotal,
      completion: hasTotal ? Math.min(100, Math.round((ownedNums.size / knownTotal) * 100)) : null,
      owned,
      missing: missingWithAvail,
    };
  });

// ---------- Missing Card Finder (expanded) ----------
// For a single missing card, surface every way to obtain it: marketplace
// buy-now listings, active auctions, open trades, collectors who own it,
// and live shows currently featuring it.
export const getMissingCardFinder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        setName: z.string().min(1).max(200),
        category: z.string().min(1).max(80),
        number: z.string().min(1).max(40),
        name: z.string().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const setName = data.setName;
    const target = normNum(data.number);
    const nowIso = new Date().toISOString();

    const [{ data: listings }, { data: liveShows }, { data: owners }, { data: wish }] =
      await Promise.all([
        supabaseAdmin
          .from("listings")
          .select("id, title, image_url, price, buy_now_price, current_bid, starting_bid, is_auction, auction_status, auction_ends_at, expires_at, tcg_number, seller_id")
          .eq("tcg_set", setName)
          .eq("is_demo", false)
          .gt("expires_at", nowIso)
          .limit(400),
        supabaseAdmin
          .from("live_streams")
          .select("id, title, thumbnail_url, seller_id, current_tcg_number, current_tcg_set, is_active")
          .eq("current_tcg_set", setName)
          .eq("is_active", true)
          .limit(100),
        supabaseAdmin
          .from("vault_cards")
          .select("id, user_id, tcg_number, accept_trades, trade_plus_cash, accept_offers")
          .eq("tcg_set", setName)
          .eq("is_sold", false)
          .neq("user_id", userId)
          .limit(800),
        supabaseAdmin
          .from("wishlist_items")
          .select("id")
          .eq("user_id", userId)
          .eq("set_name", setName)
          .eq("tcg_number", data.number)
          .limit(1),
      ]);

    const matchNum = (n: unknown) => normNum(n) === target;

    const buyNow = (listings ?? []).filter((l: any) => matchNum(l.tcg_number) && !l.is_auction);
    const auctions = (listings ?? []).filter(
      (l: any) => matchNum(l.tcg_number) && l.is_auction && l.auction_status === "active",
    );
    const shows = (liveShows ?? []).filter((s: any) => matchNum(s.current_tcg_number));
    const ownerRows = (owners ?? []).filter((o: any) => matchNum(o.tcg_number));
    const tradeOwners = ownerRows.filter(
      (o: any) => o.accept_trades || o.trade_plus_cash || o.accept_offers,
    );

    // Resolve usernames for sellers + owners we want to show.
    const ids = [
      ...new Set([
        ...buyNow.map((l: any) => l.seller_id),
        ...auctions.map((l: any) => l.seller_id),
        ...shows.map((s: any) => s.seller_id),
        ...ownerRows.slice(0, 12).map((o: any) => o.user_id),
      ].filter(Boolean)),
    ] as string[];
    const profMap = new Map<string, any>();
    if (ids.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, username, shop_name, avatar_url")
        .in("id", ids);
      (profs ?? []).forEach((p: any) => profMap.set(p.id, p));
    }
    const uname = (id: string) =>
      profMap.get(id)?.username || profMap.get(id)?.shop_name || "Collector";

    return {
      setName,
      category: data.category,
      number: data.number,
      name: data.name ?? "",
      onWishlist: (wish ?? []).length > 0,
      counts: {
        buyNow: buyNow.length,
        auctions: auctions.length,
        trades: tradeOwners.length,
        owners: ownerRows.length,
        liveShows: shows.length,
      },
      listings: buyNow.slice(0, 8).map((l: any) => ({
        id: l.id,
        title: l.title,
        image_url: l.image_url,
        priceCents: Math.round(Number(l.buy_now_price ?? l.price ?? 0) * 100),
        seller: uname(l.seller_id),
      })),
      auctions: auctions.slice(0, 8).map((l: any) => ({
        id: l.id,
        title: l.title,
        image_url: l.image_url,
        bidCents: Math.round(Number(l.current_bid ?? l.starting_bid ?? 0) * 100),
        endsAt: l.auction_ends_at,
        seller: uname(l.seller_id),
      })),
      liveShows: shows.slice(0, 6).map((s: any) => ({
        id: s.id,
        title: s.title,
        thumbnail_url: s.thumbnail_url,
        host: uname(s.seller_id),
      })),
      owners: ownerRows.slice(0, 12).map((o: any) => ({
        username: uname(o.user_id),
        avatar_url: profMap.get(o.user_id)?.avatar_url ?? null,
        openToTrade: !!(o.accept_trades || o.trade_plus_cash || o.accept_offers),
      })),
    };
  });

// ============================================================================
// Collection Goals — users favorite sets they're actively working to complete.
// ============================================================================
export const listCollectionGoals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("collection_goals")
      .select("id, set_name, category, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((g: any) => ({
      id: g.id,
      setName: g.set_name,
      category: g.category,
      key: setTotalKey(g.category, g.set_name),
    }));
  });

export const toggleCollectionGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ setName: z.string().min(1).max(200), category: z.string().min(1).max(80) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("collection_goals")
      .select("id")
      .eq("user_id", userId)
      .eq("category", data.category)
      .eq("set_name", data.setName)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase.from("collection_goals").delete().eq("id", (existing as any).id);
      if (error) throw new Error(error.message);
      return { active: false };
    }
    const { error } = await supabase
      .from("collection_goals")
      .insert({ user_id: userId, set_name: data.setName, category: data.category });
    if (error) throw new Error(error.message);
    return { active: true };
  });

// ============================================================================
// Collection Dashboard — aggregate stats across all of a user's books.
// ============================================================================
export const getCollectionDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, supabase } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const books = await computeCollectionBooks(supabaseAdmin, userId);

    const sets = books.filter((b) => b.kind === "set");
    const completed = sets.filter((b) => b.complete);
    const inProgress = sets.filter((b) => !b.complete && (b.completion ?? 0) > 0);

    const totalValueCents = books.reduce((s, b) => s + b.totalValueCents, 0);
    const missingCount = sets.reduce(
      (s, b) => s + Math.max(0, b.knownTotal - b.ownedDistinct),
      0,
    );

    // Near-completion buckets drive buying/trading.
    const near = inProgress
      .filter((b) => (b.completion ?? 0) >= 50 && !b.complete)
      .sort((a, b) => (b.completion ?? 0) - (a.completion ?? 0));
    const bucket = (min: number, max: number) =>
      near.filter((b) => (b.completion ?? 0) >= min && (b.completion ?? 0) < max).length;

    // Closest sets to completion (top 6 incomplete by %).
    const closest = inProgress
      .sort((a, b) => (b.completion ?? 0) - (a.completion ?? 0))
      .slice(0, 6)
      .map((b) => ({
        setName: b.setName,
        category: b.category,
        completion: b.completion ?? 0,
        ownedDistinct: b.ownedDistinct,
        knownTotal: b.knownTotal,
        missing: Math.max(0, b.knownTotal - b.ownedDistinct),
        cover: b.cover,
      }));

    // Goals with live progress.
    const { data: goalRows } = await supabase
      .from("collection_goals")
      .select("set_name, category")
      .eq("user_id", userId);
    const byKey = new Map(sets.map((b) => [b.key, b]));
    const goals = (goalRows ?? []).map((g: any) => {
      const b = byKey.get(setTotalKey(g.category, g.set_name));
      return {
        setName: g.set_name,
        category: g.category,
        completion: b?.completion ?? 0,
        ownedDistinct: b?.ownedDistinct ?? 0,
        knownTotal: b?.knownTotal ?? 0,
        complete: b?.complete ?? false,
        cover: b?.cover ?? null,
      };
    });

    // Rewards earned from completed-set wheel spins.
    const { count: rewardsCount } = await supabase
      .from("collection_wheel_spins")
      .select("id", { head: true, count: "exact" })
      .eq("user_id", userId);

    // Wishlist matches: wishlist items currently for sale.
    const { data: wl } = await supabase
      .from("wishlist_items")
      .select("set_name, tcg_number")
      .eq("user_id", userId)
      .limit(500);
    let wishlistMatches = 0;
    const wlBySet = new Map<string, Set<string>>();
    (wl ?? []).forEach((w: any) => {
      if (!w.set_name) return;
      const set = String(w.set_name);
      if (!wlBySet.has(set)) wlBySet.set(set, new Set());
      if (w.tcg_number) wlBySet.get(set)!.add(normNum(w.tcg_number));
    });
    const wlSets = [...wlBySet.keys()];
    if (wlSets.length) {
      const nowIso = new Date().toISOString();
      for (let i = 0; i < wlSets.length; i += 50) {
        const slice = wlSets.slice(i, i + 50);
        const { data: ls } = await supabaseAdmin
          .from("listings")
          .select("tcg_set, tcg_number")
          .in("tcg_set", slice)
          .eq("is_demo", false)
          .gt("expires_at", nowIso)
          .limit(2000);
        (ls ?? []).forEach((l: any) => {
          const wanted = wlBySet.get(l.tcg_set);
          if (wanted && (wanted.size === 0 || wanted.has(normNum(l.tcg_number)))) wishlistMatches += 1;
        });
      }
    }

    return {
      stats: {
        setsCompleted: completed.length,
        setsInProgress: inProgress.length,
        rewardsEarned: rewardsCount ?? 0,
        missingCount,
        wishlistMatches,
        collectionValueCents: totalValueCents,
        totalCards: books.reduce((s, b) => s + b.ownedCount, 0),
      },
      nearCompletion: {
        above50: bucket(50, 75),
        above75: bucket(75, 90),
        above90: bucket(90, 100),
        list: near.slice(0, 10).map((b) => ({
          setName: b.setName,
          category: b.category,
          completion: b.completion ?? 0,
          missing: Math.max(0, b.knownTotal - b.ownedDistinct),
          cover: b.cover,
        })),
      },
      closest,
      goals,
    };
  });

// ============================================================================
// Missing Card Center — aggregate missing cards across a user's near-complete
// sets, with buy/trade availability. Bounded to the most relevant sets.
// ============================================================================
export const getMissingCardCenter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, supabase } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const books = await computeCollectionBooks(supabaseAdmin, userId);

    // Favorited sets (collection goals) get top priority.
    const { data: goalRows } = await supabase
      .from("collection_goals")
      .select("set_name, category")
      .eq("user_id", userId);
    const favKeys = new Set(
      (goalRows ?? []).map((g: any) => setTotalKey(g.category, g.set_name)),
    );

    // Focus on incomplete real sets. Completion priority:
    //  1. favorited sets, 2. closest-to-done, 3. above 75%.
    const target = books
      .filter((b) => b.kind === "set" && !b.complete && (b.completion ?? 0) > 0)
      .sort((a, b) => {
        const af = favKeys.has(a.key) ? 1 : 0;
        const bf = favKeys.has(b.key) ? 1 : 0;
        if (bf !== af) return bf - af;
        return (b.completion ?? 0) - (a.completion ?? 0);
      })
      .slice(0, 12);

    const nowIso = new Date().toISOString();
    const groups: any[] = [];
    for (const b of target) {
      const { data: universe } = await supabaseAdmin
        .from("card_identities")
        .select("name, number, image_url, market_value_cents, rarity")
        .eq("set_name", b.setName)
        .limit(3000);
      const byNumber = new Map<string, BookCard>();
      (universe ?? []).forEach((u: any) => {
        const n = normNum(u.number);
        if (!n) return;
        const card: BookCard = {
          number: norm(u.number),
          name: norm(u.name),
          image_url: u.image_url ?? null,
          value: Number(u.market_value_cents ?? 0) / 100,
          rarity: u.rarity ?? null,
        };
        const ex = byNumber.get(n);
        if (!ex || (!ex.image_url && card.image_url)) byNumber.set(n, card);
      });
      // Whether we can enumerate the FULL official checklist (1..total). This
      // is what makes every missing card visible even when the catalog only
      // has details for a handful of cards in the set.
      const canEnumerate = b.official && b.knownTotal > 0;
      if (byNumber.size === 0 && !canEnumerate) continue;

      const { data: mine } = await supabaseAdmin
        .from("vault_cards")
        .select("tcg_number")
        .eq("user_id", userId)
        .eq("is_sold", false)
        .eq("tcg_set", b.setName)
        .limit(3000);
      const ownedNums = new Set((mine ?? []).map((m: any) => normNum(m.tcg_number)).filter(Boolean));

      const [{ data: listings }, { data: tradeables }] = await Promise.all([
        supabaseAdmin
          .from("listings")
          .select("tcg_number, is_auction")
          .eq("tcg_set", b.setName)
          .eq("is_demo", false)
          .gt("expires_at", nowIso)
          .limit(2000),
        supabaseAdmin
          .from("vault_cards")
          .select("tcg_number")
          .eq("tcg_set", b.setName)
          .eq("is_sold", false)
          .neq("user_id", userId)
          .or("accept_trades.eq.true,trade_plus_cash.eq.true,accept_offers.eq.true")
          .limit(2000),
      ]);
      const forSale = new Map<string, number>();
      const forAuction = new Map<string, number>();
      (listings ?? []).forEach((l: any) => {
        const n = normNum(l.tcg_number);
        if (!n) return;
        if (l.is_auction) forAuction.set(n, (forAuction.get(n) ?? 0) + 1);
        else forSale.set(n, (forSale.get(n) ?? 0) + 1);
      });
      const forTrade = new Map<string, number>();
      (tradeables ?? []).forEach((v: any) => {
        const n = normNum(v.tcg_number);
        if (n) forTrade.set(n, (forTrade.get(n) ?? 0) + 1);
      });

      const missing = [...byNumber.entries()]
        .filter(([n]) => !ownedNums.has(n))
        .map(([n, c]) => ({
          ...c,
          listingsCount: forSale.get(n) ?? 0,
          auctionCount: forAuction.get(n) ?? 0,
          tradeCount: forTrade.get(n) ?? 0,
        }))
        .sort((a, b2) => {
          const aa = (a.listingsCount > 0 ? 2 : 0) + (a.auctionCount > 0 ? 1 : 0) + (a.tradeCount > 0 ? 1 : 0);
          const bb = (b2.listingsCount > 0 ? 2 : 0) + (b2.auctionCount > 0 ? 1 : 0) + (b2.tradeCount > 0 ? 1 : 0);
          if (bb !== aa) return bb - aa;
          return (Number(a.number) || 0) - (Number(b2.number) || 0);
        });

      if (missing.length === 0) continue;
      groups.push({
        setName: b.setName,
        category: b.category,
        completion: b.completion ?? 0,
        ownedDistinct: b.ownedDistinct,
        knownTotal: b.knownTotal,
        remaining: Math.max(0, b.knownTotal - b.ownedDistinct),
        favorited: favKeys.has(b.key),
        availableCount: missing.filter((m) => m.listingsCount + m.auctionCount + m.tradeCount > 0).length,
        missing: missing.slice(0, 60),
      });
    }
    return { groups };
  });

// ============================================================================
// Bulk add EVERY missing card across ALL of a user's in-progress sets at once.
// ============================================================================
export const bulkAddAllMissingToWishlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, supabase } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const books = await computeCollectionBooks(supabaseAdmin, userId);
    const target = books
      .filter((b) => b.kind === "set" && !b.complete && (b.completion ?? 0) > 0)
      .sort((a, b) => (b.completion ?? 0) - (a.completion ?? 0))
      .slice(0, 20);

    const { data: existing } = await supabase
      .from("wishlist_items")
      .select("set_name, tcg_number")
      .eq("user_id", userId)
      .limit(5000);
    const onList = new Set(
      (existing ?? []).map((w: any) => `${normSet(w.set_name)}|||${normNum(w.tcg_number)}`),
    );

    const toAdd: any[] = [];
    for (const b of target) {
      const { data: universe } = await supabaseAdmin
        .from("card_identities")
        .select("name, number, image_url")
        .eq("set_name", b.setName)
        .limit(5000);
      const byNumber = new Map<string, { name: string; number: string; image_url: string | null }>();
      (universe ?? []).forEach((u: any) => {
        const n = normNum(u.number);
        if (!n) return;
        const ex = byNumber.get(n);
        const card = { name: norm(u.name), number: norm(u.number), image_url: u.image_url ?? null };
        if (!ex || (!ex.image_url && card.image_url)) byNumber.set(n, card);
      });
      if (byNumber.size === 0) continue;

      const { data: mine } = await supabaseAdmin
        .from("vault_cards")
        .select("tcg_number")
        .eq("user_id", userId)
        .eq("is_sold", false)
        .eq("tcg_set", b.setName)
        .limit(3000);
      const ownedNums = new Set((mine ?? []).map((m: any) => normNum(m.tcg_number)).filter(Boolean));

      for (const [n, c] of byNumber) {
        if (ownedNums.has(n)) continue;
        if (onList.has(`${normSet(b.setName)}|||${n}`)) continue;
        onList.add(`${normSet(b.setName)}|||${n}`);
        toAdd.push({
          user_id: userId,
          name: c.name || `${b.setName} #${c.number}`,
          set_name: b.setName,
          tcg_number: c.number,
          category: b.category,
          image_url: c.image_url,
          notify_sale: true,
          notify_trade: true,
          notify_live: false,
        });
      }
    }

    if (toAdd.length === 0) return { added: 0 };
    for (let i = 0; i < toAdd.length; i += 200) {
      const slice = toAdd.slice(i, i + 200);
      const { error } = await supabase.from("wishlist_items").insert(slice);
      if (error) throw new Error(error.message);
    }
    return { added: toAdd.length };
  });

// ============================================================================
// Bulk add every missing card in a set (with catalog data) to the wishlist.
// ============================================================================
export const bulkAddMissingToWishlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ setName: z.string().min(1).max(200), category: z.string().min(1).max(80) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const setName = data.setName;

    const { data: universe } = await supabaseAdmin
      .from("card_identities")
      .select("name, number, image_url")
      .eq("set_name", setName)
      .limit(5000);
    const byNumber = new Map<string, { name: string; number: string; image_url: string | null }>();
    (universe ?? []).forEach((u: any) => {
      const n = normNum(u.number);
      if (!n) return;
      const ex = byNumber.get(n);
      const card = { name: norm(u.name), number: norm(u.number), image_url: u.image_url ?? null };
      if (!ex || (!ex.image_url && card.image_url)) byNumber.set(n, card);
    });

    const { data: mine } = await supabaseAdmin
      .from("vault_cards")
      .select("tcg_number")
      .eq("user_id", userId)
      .eq("is_sold", false)
      .eq("tcg_set", setName)
      .limit(3000);
    const ownedNums = new Set((mine ?? []).map((m: any) => normNum(m.tcg_number)).filter(Boolean));

    const { data: existing } = await supabase
      .from("wishlist_items")
      .select("tcg_number")
      .eq("user_id", userId)
      .eq("set_name", setName)
      .limit(2000);
    const onList = new Set((existing ?? []).map((w: any) => normNum(w.tcg_number)).filter(Boolean));

    const toAdd = [...byNumber.entries()]
      .filter(([n]) => !ownedNums.has(n) && !onList.has(n))
      .map(([, c]) => ({
        user_id: userId,
        name: c.name || `${setName} #${c.number}`,
        set_name: setName,
        tcg_number: c.number,
        category: data.category,
        image_url: c.image_url,
        notify_sale: true,
        notify_trade: true,
        notify_live: false,
      }));

    if (toAdd.length === 0) return { added: 0 };
    for (let i = 0; i < toAdd.length; i += 200) {
      const slice = toAdd.slice(i, i + 200);
      const { error } = await supabase.from("wishlist_items").insert(slice);
      if (error) throw new Error(error.message);
    }
    return { added: toAdd.length };
  });
