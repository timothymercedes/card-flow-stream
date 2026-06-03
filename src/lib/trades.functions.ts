// PullBid Live — Trade System server functions.
// Trades coordinate a physical card swap (plus optional cash) between two users.
// Ownership is validated server-side; reputation + XP are awarded on completion.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const STATUS_FLOW = ["accepted", "shipped", "delivered", "completed"] as const;

// ---------- helpers ----------
async function loadCards(admin: any, ownerId: string, cardIds: string[]) {
  if (cardIds.length === 0) return [];
  const { data, error } = await admin
    .from("vault_cards")
    .select("id, user_id, name, image_url, estimated_value, market_price, status, accept_trades, trade_plus_cash, collection_only")
    .in("id", cardIds);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  for (const id of cardIds) {
    const row = rows.find((r: any) => r.id === id);
    if (!row) throw new Error("Card not found");
    if (row.user_id !== ownerId) throw new Error("Card ownership mismatch");
    if (row.status === "sold") throw new Error(`"${row.name}" is no longer available`);
  }
  return rows;
}

function snapshot(rows: any[], side: "from" | "to", ownerId: string) {
  return rows.map((r) => ({
    owner_side: side,
    owner_id: ownerId,
    vault_card_id: r.id,
    card_name: r.name,
    card_image_url: r.image_url ?? null,
    card_value: Number(r.market_price ?? r.estimated_value ?? 0),
  }));
}

// ---------- trade builder data (my offerable cards + their tradeable cards) ----------
export const getTradeBuilderData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ toUser: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    if (data.toUser === userId) throw new Error("You cannot trade with yourself");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const cols = "id, name, image_url, market_price, estimated_value, accept_trades, trade_plus_cash, collection_only, status";
    const [{ data: mine }, { data: theirs }, { data: prof }] = await Promise.all([
      supabaseAdmin.from("vault_cards").select(cols)
        .eq("user_id", userId).neq("status", "sold").eq("collection_only", false).limit(500),
      supabaseAdmin.from("vault_cards").select(cols)
        .eq("user_id", data.toUser).neq("status", "sold")
        .or("accept_trades.eq.true,trade_plus_cash.eq.true").limit(500),
      supabaseAdmin.from("profiles").select("id, username, avatar_url").eq("id", data.toUser).single(),
    ]);

    const map = (r: any) => ({
      id: r.id, name: r.name, image_url: r.image_url ?? null,
      value: Number(r.market_price ?? r.estimated_value ?? 0),
    });
    return {
      counterpart: { id: data.toUser, username: prof?.username ?? "user", avatar_url: prof?.avatar_url ?? null },
      myCards: (mine ?? []).map(map),
      theirCards: (theirs ?? []).map(map),
    };
  });


const createSchema = z.object({
  toUser: z.string().uuid(),
  fromCardIds: z.array(z.string().uuid()).max(50),
  toCardIds: z.array(z.string().uuid()).max(50),
  cashAmount: z.number().min(0).max(1_000_000).default(0),
  cashDirection: z.enum(["none", "from_pays", "to_pays"]).default("none"),
  message: z.string().max(1000).optional(),
});

export const createTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    if (data.toUser === userId) throw new Error("You cannot trade with yourself");
    if (data.fromCardIds.length + data.toCardIds.length === 0 && data.cashAmount === 0)
      throw new Error("A trade must include at least one card or cash");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Anti-abuse: cap open outgoing trades to a single recipient
    const { count: openCount } = await supabaseAdmin
      .from("trades")
      .select("id", { count: "exact", head: true })
      .eq("from_user", userId)
      .eq("to_user", data.toUser)
      .in("status", ["pending", "countered"]);
    if ((openCount ?? 0) >= 10) throw new Error("Too many open trades with this user");

    const fromRows = await loadCards(supabaseAdmin, userId, data.fromCardIds);
    const toRows = await loadCards(supabaseAdmin, data.toUser, data.toCardIds);
    for (const r of fromRows) if (r.collection_only) throw new Error(`"${r.name}" is marked collection-only`);
    for (const r of toRows) {
      if (!r.accept_trades && !r.trade_plus_cash)
        throw new Error(`"${r.name}" is not available for trade`);
    }

    const { data: trade, error: tErr } = await supabaseAdmin
      .from("trades")
      .insert({
        from_user: userId,
        to_user: data.toUser,
        status: "pending",
        cash_amount: data.cashAmount,
        cash_direction: data.cashDirection,
        message: data.message ?? null,
      })
      .select("id")
      .single();
    if (tErr) throw new Error(tErr.message);

    const items = [
      ...snapshot(fromRows, "from", userId),
      ...snapshot(toRows, "to", data.toUser),
    ].map((i) => ({ ...i, trade_id: trade.id }));
    if (items.length) {
      const { error: iErr } = await supabaseAdmin.from("trade_items").insert(items);
      if (iErr) throw new Error(iErr.message);
    }

    // Notify recipient (best effort)
    await supabaseAdmin.from("notifications").insert({
      user_id: data.toUser,
      sender_id: userId,
      type: "trade_offer",
      body: "You received a new trade offer",
      link: "/trades",
    }).then(() => {}, () => {});

    return { id: trade.id };
  });

// ---------- list ----------
export const listMyTrades = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: trades, error } = await supabaseAdmin
      .from("trades")
      .select("*")
      .or(`from_user.eq.${userId},to_user.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const tradeIds = (trades ?? []).map((t: any) => t.id);
    const userIds = Array.from(new Set((trades ?? []).flatMap((t: any) => [t.from_user, t.to_user])));

    const [{ data: items }, { data: profiles }, { data: myRatings }] = await Promise.all([
      tradeIds.length
        ? supabaseAdmin.from("trade_items").select("*").in("trade_id", tradeIds)
        : Promise.resolve({ data: [] as any[] }),
      userIds.length
        ? supabaseAdmin.from("profiles").select("id, username, avatar_url").in("id", userIds)
        : Promise.resolve({ data: [] as any[] }),
      tradeIds.length
        ? supabaseAdmin.from("trade_ratings").select("trade_id").eq("rater_id", userId).in("trade_id", tradeIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const pmap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const ratedSet = new Set((myRatings ?? []).map((r: any) => r.trade_id));

    return (trades ?? []).map((t: any) => {
      const counterpartId = t.from_user === userId ? t.to_user : t.from_user;
      const cp = pmap.get(counterpartId);
      return {
        ...t,
        role: t.from_user === userId ? "outgoing" : "incoming",
        counterpart: { id: counterpartId, username: cp?.username ?? "user", avatar_url: cp?.avatar_url ?? null },
        items: (items ?? []).filter((i: any) => i.trade_id === t.id),
        i_rated: ratedSet.has(t.id),
      };
    });
  });

// ---------- respond (accept / cancel / counter) ----------
const respondSchema = z.object({
  tradeId: z.string().uuid(),
  action: z.enum(["accept", "cancel", "counter"]),
  // counter payload
  fromCardIds: z.array(z.string().uuid()).max(50).optional(),
  toCardIds: z.array(z.string().uuid()).max(50).optional(),
  cashAmount: z.number().min(0).max(1_000_000).optional(),
  cashDirection: z.enum(["none", "from_pays", "to_pays"]).optional(),
  message: z.string().max(1000).optional(),
});

export const respondToTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => respondSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: trade, error } = await supabaseAdmin
      .from("trades").select("*").eq("id", data.tradeId).single();
    if (error || !trade) throw new Error("Trade not found");
    const isParticipant = trade.from_user === userId || trade.to_user === userId;
    if (!isParticipant) throw new Error("Not allowed");

    if (data.action === "cancel") {
      if (["completed", "cancelled"].includes(trade.status))
        throw new Error("Trade can no longer be cancelled");
      const { error: uErr } = await supabaseAdmin
        .from("trades").update({ status: "cancelled" }).eq("id", trade.id);
      if (uErr) throw new Error(uErr.message);
      return { status: "cancelled" };
    }

    if (data.action === "accept") {
      if (trade.to_user !== userId) throw new Error("Only the recipient can accept");
      if (!["pending", "countered"].includes(trade.status))
        throw new Error("Trade cannot be accepted in its current state");
      const { error: uErr } = await supabaseAdmin
        .from("trades").update({ status: "accepted" }).eq("id", trade.id);
      if (uErr) throw new Error(uErr.message);
      await supabaseAdmin.from("notifications").insert({
        user_id: trade.from_user, sender_id: userId,
        type: "trade_accepted", body: "Your trade offer was accepted", link: "/trades",
      }).then(() => {}, () => {});
      return { status: "accepted" };
    }

    // counter: only recipient, create reversed trade and mark this one countered
    if (trade.to_user !== userId) throw new Error("Only the recipient can counter");
    if (!["pending", "countered"].includes(trade.status))
      throw new Error("Trade cannot be countered in its current state");

    const newFrom = userId; // recipient becomes proposer
    const newTo = trade.from_user;
    const fromRows = await loadCards(supabaseAdmin, newFrom, data.fromCardIds ?? []);
    const toRows = await loadCards(supabaseAdmin, newTo, data.toCardIds ?? []);

    const { data: newTrade, error: nErr } = await supabaseAdmin
      .from("trades").insert({
        from_user: newFrom, to_user: newTo, status: "pending",
        cash_amount: data.cashAmount ?? 0, cash_direction: data.cashDirection ?? "none",
        message: data.message ?? null, parent_trade_id: trade.id,
      }).select("id").single();
    if (nErr) throw new Error(nErr.message);

    const items = [
      ...snapshot(fromRows, "from", newFrom),
      ...snapshot(toRows, "to", newTo),
    ].map((i) => ({ ...i, trade_id: newTrade.id }));
    if (items.length) await supabaseAdmin.from("trade_items").insert(items);

    await supabaseAdmin.from("trades").update({ status: "countered" }).eq("id", trade.id);
    await supabaseAdmin.from("notifications").insert({
      user_id: newTo, sender_id: userId,
      type: "trade_counter", body: "You received a counter-offer", link: "/trades",
    }).then(() => {}, () => {});

    return { status: "countered", newTradeId: newTrade.id };
  });

// ---------- advance shipping ----------
export const advanceTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ tradeId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: trade, error } = await supabaseAdmin
      .from("trades").select("*").eq("id", data.tradeId).single();
    if (error || !trade) throw new Error("Trade not found");
    if (trade.from_user !== userId && trade.to_user !== userId) throw new Error("Not allowed");

    const idx = (STATUS_FLOW as readonly string[]).indexOf(trade.status);
    if (idx < 0 || idx === STATUS_FLOW.length - 1)
      throw new Error("Trade cannot advance from its current state");
    const next = STATUS_FLOW[idx + 1];

    const patch: any = { status: next };
    if (next === "completed") patch.completed_at = new Date().toISOString();
    const { error: uErr } = await supabaseAdmin.from("trades").update(patch).eq("id", trade.id);
    if (uErr) throw new Error(uErr.message);

    if (next === "completed") {
      for (const uid of [trade.from_user, trade.to_user]) {
        await supabaseAdmin.rpc("grant_user_xp", {
          _user_id: uid, _amount: 75, _reason: "trade:completed", _ref_id: trade.id,
        }).then(() => {}, () => {});
        await supabaseAdmin.rpc("unlock_achievement", { _user_id: uid, _slug: "first_trade" }).then(() => {}, () => {});
        const { count } = await supabaseAdmin
          .from("trades").select("id", { count: "exact", head: true })
          .eq("status", "completed").or(`from_user.eq.${uid},to_user.eq.${uid}`);
        if ((count ?? 0) >= 25)
          await supabaseAdmin.rpc("unlock_achievement", { _user_id: uid, _slug: "trade_master" }).then(() => {}, () => {});
      }
    }
    return { status: next };
  });

// ---------- rate ----------
export const rateTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      tradeId: z.string().uuid(),
      stars: z.number().int().min(1).max(5),
      comment: z.string().max(1000).optional(),
    }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: trade, error } = await supabaseAdmin
      .from("trades").select("*").eq("id", data.tradeId).single();
    if (error || !trade) throw new Error("Trade not found");
    if (trade.from_user !== userId && trade.to_user !== userId) throw new Error("Not allowed");
    if (trade.status !== "completed") throw new Error("You can only rate completed trades");

    const ratee = trade.from_user === userId ? trade.to_user : trade.from_user;
    const { error: rErr } = await supabaseAdmin.from("trade_ratings").insert({
      trade_id: trade.id, rater_id: userId, ratee_id: ratee,
      stars: data.stars, comment: data.comment ?? null,
    });
    if (rErr) {
      if (rErr.code === "23505") throw new Error("You already rated this trade");
      throw new Error(rErr.message);
    }
    return { ok: true };
  });

// ---------- reputation ----------
export const getTraderReputation = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: ratings }, { count: completed }] = await Promise.all([
      supabaseAdmin.from("trade_ratings").select("stars").eq("ratee_id", data.userId),
      supabaseAdmin.from("trades").select("id", { count: "exact", head: true })
        .eq("status", "completed").or(`from_user.eq.${data.userId},to_user.eq.${data.userId}`),
    ]);
    const list = ratings ?? [];
    const avg = list.length ? list.reduce((s: number, r: any) => s + r.stars, 0) / list.length : 0;
    const completedTrades = completed ?? 0;
    let badge: "none" | "trusted" | "elite" = "none";
    if (completedTrades >= 50 && avg >= 4.8) badge = "elite";
    else if (completedTrades >= 10 && avg >= 4.5) badge = "trusted";
    return {
      averageStars: Math.round(avg * 10) / 10,
      ratingCount: list.length,
      completedTrades,
      badge,
    };
  });

// ============================================================================
// Smart Trade Discovery — matches the cards you WANT (wishlist + cards missing
// from sets you're close to completing) against tradeable cards other
// collectors own. Reverse-matches their wishlists against your tradeable cards
// to surface mutual ("both win") trade opportunities, ranked highest.
// Owner-centric: "Collector X has 3 cards you need and wants 2 of yours."
// ============================================================================
const dNorm = (v: unknown) => String(v ?? "").trim();
const dNumN = (v: unknown) => dNorm(v).replace(/^0+(?=\d)/, "").toLowerCase();
const dSetN = (v: unknown) => dNorm(v).toLowerCase();
const TRADEABLE_OR = "accept_trades.eq.true,trade_plus_cash.eq.true";

function pushTo<T>(map: Map<string, T[]>, key: string, val: T) {
  const arr = map.get(key);
  if (arr) arr.push(val);
  else map.set(key, [val]);
}

export const getTradeDiscovery = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { computeCollectionBooks } = await import("@/lib/collection.functions");

    const tcols =
      "id, user_id, name, image_url, market_price, estimated_value, card_identity_id, tcg_set, tcg_number";

    // 1) What the user WANTS — from their wishlist.
    const { data: wl } = await supabaseAdmin
      .from("wishlist_items")
      .select("card_identity_id, set_name, tcg_number, name")
      .eq("user_id", userId)
      .limit(300);
    const wantIdentity = new Set<string>();
    const wantSetNum = new Set<string>();
    const wantSets = new Set<string>();
    (wl ?? []).forEach((w: any) => {
      if (w.card_identity_id) wantIdentity.add(w.card_identity_id);
      if (w.set_name && w.tcg_number) wantSetNum.add(`${dSetN(w.set_name)}|${dNumN(w.tcg_number)}`);
      if (w.set_name) wantSets.add(w.set_name);
    });

    // 2) Sets the user is close to completing — any card they don't own counts.
    const books = await computeCollectionBooks(supabaseAdmin, userId);
    const nearSets = books
      .filter((b) => b.kind === "set" && !b.complete && (b.completion ?? 0) >= 40)
      .sort((a, b) => (b.completion ?? 0) - (a.completion ?? 0))
      .slice(0, 6);
    const ownedBySet = new Map<string, Set<string>>();
    for (const b of nearSets) {
      const { data: mine } = await supabaseAdmin
        .from("vault_cards")
        .select("tcg_number")
        .eq("user_id", userId)
        .eq("is_sold", false)
        .eq("tcg_set", b.setName)
        .limit(3000);
      ownedBySet.set(
        dSetN(b.setName),
        new Set((mine ?? []).map((m: any) => dNumN(m.tcg_number)).filter(Boolean)),
      );
    }

    // 3) Find tradeable cards from OTHER collectors that match what we want.
    const matchesByOwner = new Map<string, any[]>();
    const seen = new Map<string, Set<string>>();
    const addCard = (ownerId: string, c: any, reason: string) => {
      if (!ownerId || ownerId === userId) return;
      if (!seen.has(ownerId)) seen.set(ownerId, new Set());
      if (seen.get(ownerId)!.has(c.id)) return;
      seen.get(ownerId)!.add(c.id);
      pushTo(matchesByOwner, ownerId, {
        vaultCardId: c.id,
        name: c.name,
        image: c.image_url ?? null,
        value: Number(c.market_price ?? c.estimated_value ?? 0),
        reason,
      });
    };

    // 3a) Exact wishlist matches by card identity.
    const idArr = [...wantIdentity];
    for (let i = 0; i < idArr.length; i += 100) {
      const { data } = await supabaseAdmin
        .from("vault_cards")
        .select(tcols)
        .in("card_identity_id", idArr.slice(i, i + 100))
        .eq("is_sold", false)
        .eq("is_demo", false)
        .eq("collection_only", false)
        .neq("user_id", userId)
        .or(TRADEABLE_OR)
        .limit(2000);
      (data ?? []).forEach((c: any) => addCard(c.user_id, c, "On your wishlist"));
    }

    // 3b) Set-based matches (wishlist set+number, and near-complete missing).
    const setNames = [...new Set([...wantSets, ...nearSets.map((b) => b.setName)])];
    for (let i = 0; i < setNames.length; i += 50) {
      const { data } = await supabaseAdmin
        .from("vault_cards")
        .select(tcols)
        .in("tcg_set", setNames.slice(i, i + 50))
        .eq("is_sold", false)
        .eq("is_demo", false)
        .eq("collection_only", false)
        .neq("user_id", userId)
        .or(TRADEABLE_OR)
        .limit(3000);
      (data ?? []).forEach((c: any) => {
        const setL = dSetN(c.tcg_set);
        const numL = dNumN(c.tcg_number);
        if (numL && wantSetNum.has(`${setL}|${numL}`)) {
          addCard(c.user_id, c, "On your wishlist");
          return;
        }
        const owned = ownedBySet.get(setL);
        if (owned && numL && !owned.has(numL)) {
          const setName = nearSets.find((b) => dSetN(b.setName) === setL)?.setName ?? c.tcg_set;
          addCard(c.user_id, c, `Completes ${setName}`);
        }
      });
    }

    if (matchesByOwner.size === 0) return { opportunities: [] };
    const ownerIds = [...matchesByOwner.keys()];

    // 4) Reverse match — what I can OFFER these owners (their wishlist vs my cards).
    const { data: myCards } = await supabaseAdmin
      .from("vault_cards")
      .select(tcols)
      .eq("user_id", userId)
      .eq("is_sold", false)
      .eq("is_demo", false)
      .eq("collection_only", false)
      .or(TRADEABLE_OR)
      .limit(500);
    const myByIdentity = new Map<string, any[]>();
    const myBySetNum = new Map<string, any[]>();
    (myCards ?? []).forEach((c: any) => {
      if (c.card_identity_id) pushTo(myByIdentity, c.card_identity_id, c);
      if (c.tcg_set && c.tcg_number) pushTo(myBySetNum, `${dSetN(c.tcg_set)}|${dNumN(c.tcg_number)}`, c);
    });
    const offerByOwner = new Map<string, any[]>();
    const offerSeen = new Map<string, Set<string>>();
    for (let i = 0; i < ownerIds.length; i += 100) {
      const { data: theirWl } = await supabaseAdmin
        .from("wishlist_items")
        .select("user_id, card_identity_id, set_name, tcg_number")
        .in("user_id", ownerIds.slice(i, i + 100))
        .limit(3000);
      (theirWl ?? []).forEach((w: any) => {
        let cand: any[] = [];
        if (w.card_identity_id && myByIdentity.has(w.card_identity_id)) {
          cand = myByIdentity.get(w.card_identity_id)!;
        } else if (w.set_name && w.tcg_number) {
          cand = myBySetNum.get(`${dSetN(w.set_name)}|${dNumN(w.tcg_number)}`) ?? [];
        }
        if (!cand.length) return;
        if (!offerSeen.has(w.user_id)) offerSeen.set(w.user_id, new Set());
        cand.forEach((c) => {
          if (offerSeen.get(w.user_id)!.has(c.id)) return;
          offerSeen.get(w.user_id)!.add(c.id);
          pushTo(offerByOwner, w.user_id, {
            vaultCardId: c.id,
            name: c.name,
            image: c.image_url ?? null,
            value: Number(c.market_price ?? c.estimated_value ?? 0),
          });
        });
      });
    }

    // 5) Profiles + assemble + rank (mutual first, then by how many they have).
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, username, avatar_url")
      .in("id", ownerIds);
    const profMap = new Map((profs ?? []).map((p: any) => [p.id, p]));

    const opportunities = ownerIds
      .map((id) => {
        const want = matchesByOwner.get(id) ?? [];
        const offer = offerByOwner.get(id) ?? [];
        const p = profMap.get(id);
        return {
          ownerId: id,
          username: p?.username ?? "collector",
          avatarUrl: p?.avatar_url ?? null,
          theyHave: want.slice(0, 12),
          theyHaveCount: want.length,
          iCanOffer: offer.slice(0, 12),
          iCanOfferCount: offer.length,
          mutual: offer.length > 0,
        };
      })
      .sort((a, b) => {
        if (a.mutual !== b.mutual) return a.mutual ? -1 : 1;
        return b.theyHaveCount - a.theyHaveCount;
      })
      .slice(0, 30);

    return { opportunities };
  });
