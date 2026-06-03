// PullBid Arena — server functions. Real cards are NEVER at risk; only digital
// companions, XP, ranks, trophies and cosmetics are affected by anything here.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  titleForWins, communityForCategory, deriveCompanionStats, valueTier,
  companionLevel, DIFFICULTY_META, earnedBadgeKeys, PVP_WIN_CREDITS,
  type ArenaTitle, type ArenaDifficulty, type ArenaBadgeKey,
} from "@/lib/arenaShared";
import { arenaCategoryFor } from "@/lib/arenaCategories";
import { ARENA_DAILY_CHALLENGES, CHALLENGE_MAP } from "@/lib/arenaChallenges";
import { COSMETIC_MAP } from "@/lib/arenaCosmetics";

type CompanionRow = {
  id: string; user_id: string; vault_card_id: string; name: string;
  category: string | null; community: string; arena_category: string; image_url: string | null;
  level: number; xp: number; attack: number; defense: number; speed: number;
  hidden_traits: string[]; wins: number; losses: number; win_streak: number;
  longest_win_streak: number; season_wins: number; trophies: number;
  arena_rank: number; title: ArenaTitle; cosmetics: Record<string, any>;
  created_at: string;
};

// Limited, opponent-safe projection — NEVER includes attack/defense/speed/traits/xp.
function publicProjection(c: CompanionRow) {
  const total = c.wins + c.losses;
  return {
    id: c.id, user_id: c.user_id, name: c.name, category: c.category,
    community: c.community, arena_category: c.arena_category, image_url: c.image_url,
    wins: c.wins, losses: c.losses,
    win_rate: total > 0 ? Math.round((c.wins / total) * 1000) / 10 : 0,
    title: c.title, trophies: c.trophies, arena_rank: c.arena_rank,
    longest_win_streak: c.longest_win_streak,
  };
}

type Admin = { from: (t: string) => any };

// Award PullBid Credits directly (server-side, bypasses RLS). Used for PVP wins.
async function creditWinner(admin: Admin, userId: string, amount: number, refId: string) {
  if (amount <= 0) return;
  const { data: wallet } = await admin
    .from("credit_wallets").select("balance, lifetime_earned").eq("user_id", userId).maybeSingle();
  const balance = (wallet?.balance ?? 0) + amount;
  const lifetimeEarned = (wallet?.lifetime_earned ?? 0) + amount;
  await admin.from("credit_wallets").upsert(
    { user_id: userId, balance, lifetime_earned: lifetimeEarned, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  await admin.from("credit_transactions").insert({
    user_id: userId, amount, balance_after: balance,
    source: "arena_battle", ref_id: refId, description: "Arena PVP victory",
  });
}

// Grant any newly-qualified badges. Returns the keys that were newly granted.
async function grantBadges(admin: Admin, userId: string, keys: ArenaBadgeKey[]): Promise<ArenaBadgeKey[]> {
  if (keys.length === 0) return [];
  const { data: existing } = await admin
    .from("arena_badges").select("badge_key").eq("user_id", userId);
  const have = new Set((existing || []).map((r: any) => r.badge_key));
  const toAdd = keys.filter((k) => !have.has(k));
  if (toAdd.length === 0) return [];
  await admin.from("arena_badges").insert(toAdd.map((k) => ({ user_id: userId, badge_key: k })));
  return toAdd;
}

// Total wins + longest streak across all of a user's companions.
async function userBattleAggregate(admin: Admin, userId: string): Promise<{ wins: number; longest: number }> {
  const { data } = await admin
    .from("arena_companions").select("wins, longest_win_streak").eq("user_id", userId);
  let wins = 0, longest = 0;
  for (const r of (data || []) as any[]) { wins += r.wins; longest = Math.max(longest, r.longest_win_streak); }
  return { wins, longest };
}

// ---- Sync companions from the user's Vault (unlock new digital companions) ----
export const syncCompanions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: cards, error } = await supabase
      .from("vault_cards")
      .select("id, name, category, image_url, estimated_value, market_price")
      .eq("user_id", userId)
      .neq("status", "sold");
    if (error) throw new Error(error.message);

    const { data: existing } = await supabase
      .from("arena_companions").select("vault_card_id").eq("user_id", userId);
    const have = new Set((existing || []).map((r: any) => r.vault_card_id));

    const toCreate = (cards || []).filter((c: any) => !have.has(c.id)).map((c: any) => {
      const tier = valueTier(c.market_price ?? c.estimated_value);
      const stats = deriveCompanionStats(`${c.id}:${c.name}`, tier);
      return {
        user_id: userId,
        vault_card_id: c.id,
        name: c.name,
        category: c.category,
        community: communityForCategory(c.category),
        arena_category: arenaCategoryFor(c.category),
        image_url: c.image_url,
        attack: stats.attack,
        defense: stats.defense,
        speed: stats.speed,
        hidden_traits: stats.hidden_traits,
        xp: 25, // starter XP for unlocking
        level: companionLevel(25),
      };
    });

    if (toCreate.length > 0) {
      const { error: insErr } = await supabase.from("arena_companions").insert(toCreate);
      if (insErr) throw new Error(insErr.message);
    }
    return { created: toCreate.length };
  });

// ---- Owner's full companion roster (full stats visible) ----
export const listMyCompanions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("arena_companions").select("*").eq("user_id", userId)
      .order("arena_rank", { ascending: false });
    if (error) throw new Error(error.message);
    return { companions: (data || []) as unknown as CompanionRow[] };
  });

// ---- Public roster for a given user (limited stats only) ----
export const getPublicCompanions = createServerFn({ method: "GET" })
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("arena_companions").select("*").eq("user_id", data.userId)
      .order("wins", { ascending: false });
    if (error) throw new Error(error.message);
    return { companions: ((rows || []) as unknown as CompanionRow[]).map(publicProjection) };
  });

// ---- Find opponents (other users' companions, limited stats) ----
// Category-scoped matchmaking: collectors battle within their own Arena
// category (Pokémon vs Pokémon, etc.). Pass category "all" / undefined for a
// cross-category pool. `community` is kept for backward compatibility.
// Core query logic, extracted so it can be exercised in integration tests
// without the server-function/runtime layer. `admin` is a Supabase client.
export async function fetchOpponentsCore(
  admin: { from: (t: string) => any },
  userId: string,
  category?: string,
  community?: string,
) {
  let q = admin.from("arena_companions").select("*").neq("user_id", userId).limit(60);
  if (category && category !== "all") q = q.eq("arena_category", category);
  else if (community && community !== "general") q = q.eq("community", community);
  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);
  // Shuffle and take up to 12
  const arr = (rows || []) as unknown as CompanionRow[];
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return { opponents: arr.slice(0, 12).map(publicProjection) };
}

export const findOpponents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { category?: string; community?: string }) => d ?? {})
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return fetchOpponentsCore(supabaseAdmin, userId, data.category, data.community);
  });


function power(c: { attack: number; defense: number; speed: number; level: number }): number {
  const base = c.attack * 1.0 + c.defense * 0.8 + c.speed * 0.6 + c.level * 5;
  const luck = 0.85 + Math.random() * 0.3; // 0.85 – 1.15
  return base * luck;
}

// Shared PVP resolution. `me`/`them` are full companion rows; `callerId` is the
// signed-in user (always the challenger). Awards credits + badges to the caller
// on a win. `social` flags battles against a followed collector (extra badge).
async function resolvePvpBattle(
  admin: Admin,
  me: CompanionRow,
  them: CompanionRow,
  callerId: string,
  social: boolean,
) {
  const log: Array<{ round: number; mine: number; theirs: number; winner: "mine" | "theirs" }> = [];
  let myRounds = 0, theirRounds = 0;
  for (let r = 1; r <= 3; r++) {
    const mp = power(me); const tp = power(them);
    const w = mp >= tp ? "mine" : "theirs";
    if (w === "mine") myRounds++; else theirRounds++;
    log.push({ round: r, mine: Math.round(mp), theirs: Math.round(tp), winner: w });
  }
  const iWon = myRounds > theirRounds;
  const winner = iWon ? me : them;
  const loser = iWon ? them : me;

  const wWins = winner.wins + 1;
  const wStreak = winner.win_streak + 1;
  const wXp = winner.xp + 50;
  const winnerUpdate = {
    wins: wWins, win_streak: wStreak,
    longest_win_streak: Math.max(winner.longest_win_streak, wStreak),
    season_wins: winner.season_wins + 1, trophies: winner.trophies + 10,
    arena_rank: winner.arena_rank + 15, xp: wXp,
    level: companionLevel(wXp), title: titleForWins(wWins),
  };
  const lXp = loser.xp + 15;
  const loserUpdate = {
    losses: loser.losses + 1, win_streak: 0, trophies: loser.trophies + 2,
    arena_rank: Math.max(0, loser.arena_rank - 10), xp: lXp, level: companionLevel(lXp),
  };

  await admin.from("arena_companions").update(winnerUpdate).eq("id", winner.id);
  await admin.from("arena_companions").update(loserUpdate).eq("id", loser.id);

  const { data: season } = await admin
    .from("arena_seasons").select("id").eq("active", true).maybeSingle();

  const { data: battle } = await admin.from("arena_battles").insert({
    challenger_id: me.user_id,
    opponent_id: them.user_id,
    challenger_companion_id: me.id,
    opponent_companion_id: them.id,
    winner_companion_id: winner.id,
    status: "resolved",
    log,
    season_id: season?.id ?? null,
  }).select("id").maybeSingle();

  // Caller payouts (winner only) + badges.
  let credits = 0;
  let newBadges: ArenaBadgeKey[] = [];
  if (iWon) {
    credits = PVP_WIN_CREDITS;
    await creditWinner(admin, callerId, credits, battle?.id ?? "arena");
  }
  const agg = await userBattleAggregate(admin, callerId);
  const milestone = earnedBadgeKeys(agg.wins, agg.longest);
  if (social && iWon) milestone.push("social_battler");
  newBadges = await grantBadges(admin, callerId, milestone);

  return {
    iWon, myRounds, theirRounds, log,
    rewards: iWon
      ? { xp: 50, trophies: 10, rank: 15, credits }
      : { xp: 15, trophies: 2, rank: -10, credits: 0 },
    opponentName: them.name,
    opponentImage: them.image_url ?? null,
    newBadges,
  };
}

// ---- Challenge an opponent and resolve the battle server-side ----
export const challengeAndResolve = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { myCompanionId: string; opponentCompanionId: string }) => d)
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: mine, error: e1 } = await supabaseAdmin
      .from("arena_companions").select("*").eq("id", data.myCompanionId).maybeSingle();
    if (e1 || !mine) throw new Error("Your companion was not found");
    if (mine.user_id !== userId) throw new Error("Not your companion");

    const { data: opp, error: e2 } = await supabaseAdmin
      .from("arena_companions").select("*").eq("id", data.opponentCompanionId).maybeSingle();
    if (e2 || !opp) throw new Error("Opponent companion not found");
    if (opp.user_id === userId) throw new Error("You cannot battle your own companion");

    const me = mine as unknown as CompanionRow;
    const them = opp as unknown as CompanionRow;
    const { data: f } = await supabaseAdmin
      .from("follows").select("followee_id").eq("follower_id", userId).eq("followee_id", them.user_id).maybeSingle();
    return resolvePvpBattle(supabaseAdmin, me, them, userId, !!f);
  });

// ---- Challenge a specific collector (Friends / direct / rematch battles) ----
// Picks the target collector's strongest companion automatically.
export const challengeUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { myCompanionId: string; targetUserId: string }) => d)
  .handler(async ({ context, data }) => {
    const { userId } = context;
    if (data.targetUserId === userId) throw new Error("You cannot battle yourself");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: mine, error: e1 } = await supabaseAdmin
      .from("arena_companions").select("*").eq("id", data.myCompanionId).maybeSingle();
    if (e1 || !mine) throw new Error("Your companion was not found");
    if (mine.user_id !== userId) throw new Error("Not your companion");

    const { data: theirs } = await supabaseAdmin
      .from("arena_companions").select("*").eq("user_id", data.targetUserId)
      .order("arena_rank", { ascending: false }).limit(1);
    const opp = (theirs || [])[0];
    if (!opp) throw new Error("This collector has no companions to battle yet");

    const me = mine as unknown as CompanionRow;
    const them = opp as unknown as CompanionRow;
    const { data: f } = await supabaseAdmin
      .from("follows").select("followee_id").eq("follower_id", userId).eq("followee_id", data.targetUserId).maybeSingle();
    return resolvePvpBattle(supabaseAdmin, me, them, userId, !!f);
  });

// ---- Training XP hook (reusable across platform activity) ----
export const awardCompanionXp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companionId: string; amount: number; reason?: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const amt = Math.max(0, Math.min(500, Math.round(data.amount)));
    const { data: c, error } = await supabase
      .from("arena_companions").select("id, xp").eq("id", data.companionId).eq("user_id", userId).maybeSingle();
    if (error || !c) throw new Error("Companion not found");
    const newXp = (c as any).xp + amt;
    const { error: upErr } = await supabase
      .from("arena_companions").update({ xp: newXp, level: companionLevel(newXp) })
      .eq("id", data.companionId).eq("user_id", userId);
    if (upErr) throw new Error(upErr.message);
    return { xp: newXp, level: companionLevel(newXp), awarded: amt };
  });

// ---- PVE: battle a computer opponent (training) ----
// Capped, reduced rewards. NO arena_rank / season_wins / leaderboard points are
// awarded — real PVP battles are always more valuable (anti-abuse).
const COMPUTER_NAMES = [
  "Training Dummy", "Rookie Bot", "Arena Sentinel", "Practice Golem",
  "Sparring Partner", "Mock Challenger", "Drill Master", "Shadow Trainer",
];

export const battlePve = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { myCompanionId: string; difficulty: ArenaDifficulty }) => d)
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const diff = DIFFICULTY_META[data.difficulty] ?? DIFFICULTY_META.normal;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: mine, error: e1 } = await supabaseAdmin
      .from("arena_companions").select("*").eq("id", data.myCompanionId).maybeSingle();
    if (e1 || !mine) throw new Error("Your companion was not found");
    if (mine.user_id !== userId) throw new Error("Not your companion");
    const me = mine as unknown as CompanionRow;

    // Computer opponent derived from the player's companion, scaled by difficulty.
    const cpu = {
      attack: Math.round(me.attack * diff.mult),
      defense: Math.round(me.defense * diff.mult),
      speed: Math.round(me.speed * diff.mult),
      level: me.level,
    };

    const log: Array<{ round: number; mine: number; theirs: number; winner: "mine" | "theirs" }> = [];
    let myRounds = 0, theirRounds = 0;
    for (let r = 1; r <= 3; r++) {
      const mp = power(me); const tp = power(cpu);
      const w = mp >= tp ? "mine" : "theirs";
      if (w === "mine") myRounds++; else theirRounds++;
      log.push({ round: r, mine: Math.round(mp), theirs: Math.round(tp), winner: w });
    }
    const iWon = myRounds > theirRounds;

    const gainedXp = iWon ? diff.winXp : diff.lossXp;
    const newXp = me.xp + gainedXp;
    const update: {
      xp: number; level: number; wins?: number; losses?: number;
      win_streak?: number; longest_win_streak?: number; trophies?: number; title?: ArenaTitle;
    } = {
      xp: newXp,
      level: companionLevel(newXp),
    };
    if (iWon) {
      const wWins = me.wins + 1;
      const wStreak = me.win_streak + 1;
      update.wins = wWins;
      update.win_streak = wStreak;
      update.longest_win_streak = Math.max(me.longest_win_streak, wStreak);
      update.trophies = me.trophies + diff.winTrophies;
      update.title = titleForWins(wWins);
      // Note: arena_rank and season_wins deliberately unchanged for PVE.
    } else {
      update.losses = me.losses + 1;
      update.win_streak = 0;
    }
    await supabaseAdmin.from("arena_companions").update(update).eq("id", me.id);

    const cpuName = COMPUTER_NAMES[Math.floor(Math.random() * COMPUTER_NAMES.length)];
    await supabaseAdmin.from("arena_battles").insert({
      challenger_id: me.user_id,
      opponent_id: null,
      challenger_companion_id: me.id,
      opponent_companion_id: null,
      winner_companion_id: iWon ? me.id : null,
      status: "resolved",
      battle_type: "pve",
      difficulty: data.difficulty,
      log,
    });

    return {
      iWon,
      myRounds,
      theirRounds,
      log,
      rewards: { xp: gainedXp, trophies: iWon ? diff.winTrophies : 0, rank: 0, credits: 0 },
      opponentName: `${cpuName} (${diff.label})`,
      opponentImage: null as string | null,
      newBadges: [] as ArenaBadgeKey[],
    };
  });

// ---- Battle history for the signed-in user (PVP + PVE) ----
export const getBattleHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("arena_battles")
      .select("id, challenger_id, opponent_id, challenger_companion_id, winner_companion_id, battle_type, difficulty, created_at")
      .or(`challenger_id.eq.${userId},opponent_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);

    // Map each battle to a win/loss from this user's perspective.
    const myCompanionIds = new Set<string>();
    const { data: mine } = await supabase
      .from("arena_companions").select("id").eq("user_id", userId);
    for (const c of (mine || []) as any[]) myCompanionIds.add(c.id);

    const battles = ((rows || []) as any[]).map((b) => {
      const iAmChallenger = b.challenger_id === userId;
      const iWon = b.winner_companion_id != null && myCompanionIds.has(b.winner_companion_id);
      return {
        id: b.id,
        type: b.battle_type as "pvp" | "pve",
        difficulty: b.difficulty as ArenaDifficulty | null,
        iWon,
        result: b.winner_companion_id == null ? "loss" : iWon ? "win" : "loss",
        created_at: b.created_at,
        iAmChallenger,
      };
    });

    const wins = battles.filter((b) => b.iWon).length;
    const losses = battles.length - wins;
    // Current streak from most-recent backwards.
    let currentStreak = 0;
    for (const b of battles) { if (b.iWon) currentStreak++; else break; }

    return { battles, wins, losses, currentStreak };
  });

// ---- Leaderboards (seasonal, optionally scoped to one Arena category) ----
export const getLeaderboards = createServerFn({ method: "GET" })
  .inputValidator((d?: { category?: string }) => ({ category: d?.category ?? "all" }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cat = data.category;
    const scope = (q: any) => (cat && cat !== "all" ? q.eq("arena_category", cat) : q);

    const [mostWins, longestStreak] = await Promise.all([
      scope(supabaseAdmin.from("arena_companions").select("*")).order("wins", { ascending: false }).limit(20),
      scope(supabaseAdmin.from("arena_companions").select("*")).order("longest_win_streak", { ascending: false }).limit(20),
    ]);
    const projW = ((mostWins.data || []) as unknown as CompanionRow[]).map(publicProjection);
    const projS = ((longestStreak.data || []) as unknown as CompanionRow[]).map(publicProjection);

    // Top trainers: aggregate season_wins by user (within scope).
    const { data: all } = await scope(
      supabaseAdmin.from("arena_companions").select("user_id, season_wins, wins, trophies"),
    );
    const byUser = new Map<string, { user_id: string; season_wins: number; wins: number; trophies: number }>();
    for (const r of (all || []) as any[]) {
      const e = byUser.get(r.user_id) || { user_id: r.user_id, season_wins: 0, wins: 0, trophies: 0 };
      e.season_wins += r.season_wins; e.wins += r.wins; e.trophies += r.trophies;
      byUser.set(r.user_id, e);
    }
    const trainers = [...byUser.values()].sort((a, b) => b.season_wins - a.season_wins).slice(0, 20);

    return { mostWins: projW, longestStreak: projS, topTrainers: trainers, category: cat };
  });

// ================= Collector discovery & social =================

// Aggregate a user's arena standing from their companion roster.
function aggregateUser(rows: CompanionRow[]) {
  let wins = 0, losses = 0, trophies = 0, longest = 0, companions = 0;
  let best: ArenaTitle = "rookie";
  const order: ArenaTitle[] = ["rookie", "veteran", "elite", "champion", "legend"];
  for (const c of rows) {
    wins += c.wins; losses += c.losses; trophies += c.trophies;
    longest = Math.max(longest, c.longest_win_streak); companions++;
    if (order.indexOf(c.title) > order.indexOf(best)) best = c.title;
  }
  return { wins, losses, trophies, longest, companions, best };
}

// ---- Search collectors by username (Arena profiles) ----
export const searchCollectors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { query?: string }) => ({ query: (d?.query ?? "").trim().slice(0, 60) }))
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let pq = supabaseAdmin.from("profiles").select("id, username, avatar_url").neq("id", userId).limit(20);
    if (data.query) pq = pq.ilike("username", `%${data.query}%`);
    const { data: profiles, error } = await pq;
    if (error) throw new Error(error.message);
    const ids = (profiles || []).map((p: any) => p.id);
    if (ids.length === 0) return { collectors: [] as any[] };

    const { data: comps } = await supabaseAdmin
      .from("arena_companions").select("*").in("user_id", ids);
    const byUser = new Map<string, CompanionRow[]>();
    for (const c of ((comps || []) as unknown as CompanionRow[])) {
      const arr = byUser.get(c.user_id) || []; arr.push(c); byUser.set(c.user_id, arr);
    }
    const { data: follows } = await supabaseAdmin
      .from("follows").select("followee_id").eq("follower_id", userId).in("followee_id", ids);
    const following = new Set((follows || []).map((f: any) => f.followee_id));

    const collectors = (profiles || []).map((p: any) => {
      const agg = aggregateUser(byUser.get(p.id) || []);
      return {
        user_id: p.id, username: p.username, avatar_url: p.avatar_url,
        ...agg, isFollowing: following.has(p.id),
      };
    }).sort((a: any, b: any) => b.wins - a.wins);
    return { collectors };
  });

// ---- Full Arena profile for one collector ----
export const getArenaProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile } = await supabaseAdmin
      .from("profiles").select("id, username, avatar_url").eq("id", data.userId).maybeSingle();
    if (!profile) throw new Error("Collector not found");

    const { data: comps } = await supabaseAdmin
      .from("arena_companions").select("*").eq("user_id", data.userId).order("arena_rank", { ascending: false });
    const rows = (comps || []) as unknown as CompanionRow[];
    const agg = aggregateUser(rows);

    const { data: badges } = await supabaseAdmin
      .from("arena_badges").select("badge_key").eq("user_id", data.userId);
    const { data: f } = await supabaseAdmin
      .from("follows").select("followee_id").eq("follower_id", userId).eq("followee_id", data.userId).maybeSingle();

    return {
      profile: { user_id: profile.id, username: profile.username, avatar_url: profile.avatar_url },
      ...agg,
      companions: rows.map(publicProjection),
      badges: (badges || []).map((b: any) => b.badge_key as ArenaBadgeKey),
      isFollowing: !!f,
      isSelf: data.userId === userId,
    };
  });

// ---- Follow / unfollow a collector ----
export const followCollector = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    if (data.userId === userId) throw new Error("You cannot follow yourself");
    const { error } = await supabase
      .from("follows").upsert({ follower_id: userId, followee_id: data.userId }, { onConflict: "follower_id,followee_id" });
    if (error) throw new Error(error.message);
    return { following: true };
  });

export const unfollowCollector = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("follows").delete().eq("follower_id", userId).eq("followee_id", data.userId);
    if (error) throw new Error(error.message);
    return { following: false };
  });

// ---- Recent PVP opponents for the signed-in user (rematch) ----
export const getRecentOpponents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: battles } = await supabaseAdmin
      .from("arena_battles")
      .select("opponent_id, created_at")
      .eq("challenger_id", userId).eq("battle_type", "pvp")
      .not("opponent_id", "is", null)
      .order("created_at", { ascending: false }).limit(60);

    const seen = new Map<string, string>(); // user_id -> last battle date
    for (const b of ((battles || []) as any[])) {
      if (!seen.has(b.opponent_id)) seen.set(b.opponent_id, b.created_at);
    }
    const ids = [...seen.keys()].slice(0, 12);
    if (ids.length === 0) return { opponents: [] as any[] };

    const { data: profiles } = await supabaseAdmin
      .from("profiles").select("id, username, avatar_url").in("id", ids);
    const pmap = new Map((profiles || []).map((p: any) => [p.id, p]));
    const opponents = ids.map((id) => {
      const p = pmap.get(id) as any;
      return {
        user_id: id, username: p?.username ?? "Collector",
        avatar_url: p?.avatar_url ?? null, last_battle: seen.get(id)!,
      };
    });
    return { opponents };
  });

// ---- Badges earned by the signed-in user ----
export const listMyBadges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("arena_badges").select("badge_key, earned_at").eq("user_id", userId)
      .order("earned_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { badges: (data || []).map((b: any) => ({ key: b.badge_key as ArenaBadgeKey, earned_at: b.earned_at })) };
  });

// ===================================================================
// Phase 3 — Daily challenges, cosmetics & rewards (digital-only).
// ===================================================================

function startOfTodayUtc(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

// Compute today's battle metrics for a user from arena_battles.
async function todaysMetrics(admin: Admin, userId: string) {
  const since = startOfTodayUtc();
  const { data } = await admin
    .from("arena_battles")
    .select("battle_type, winner_companion_id, challenger_companion_id")
    .eq("challenger_id", userId)
    .gte("created_at", since);
  const rows = (data || []) as Array<{ battle_type: string; winner_companion_id: string | null; challenger_companion_id: string }>;
  let pvp_wins = 0, pve_battles = 0;
  for (const r of rows) {
    if (r.battle_type === "pve") pve_battles++;
    else if (r.winner_companion_id && r.winner_companion_id === r.challenger_companion_id) pvp_wins++;
  }
  return { pvp_wins, pve_battles, total_battles: rows.length };
}

// Spend PullBid Credits (server-side). Throws if balance is insufficient.
async function spendCredits(admin: Admin, userId: string, amount: number, refId: string, desc: string) {
  if (amount <= 0) return;
  const { data: wallet } = await admin
    .from("credit_wallets").select("balance, lifetime_spent").eq("user_id", userId).maybeSingle();
  const current = wallet?.balance ?? 0;
  if (current < amount) throw new Error("Not enough PullBid Credits");
  const balance = current - amount;
  const lifetimeSpent = (wallet?.lifetime_spent ?? 0) + amount;
  await admin.from("credit_wallets").upsert(
    { user_id: userId, balance, lifetime_spent: lifetimeSpent, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  await admin.from("credit_transactions").insert({
    user_id: userId, amount: -amount, balance_after: balance,
    source: "arena_cosmetic", ref_id: refId, description: desc,
  });
}

// ---- Daily challenges with live progress + claim status ----
export const getDailyChallenges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const metrics = await todaysMetrics(supabaseAdmin, userId);
    const since = startOfTodayUtc().slice(0, 10);
    const { data: claims } = await supabaseAdmin
      .from("arena_daily_claims").select("challenge_key")
      .eq("user_id", userId).eq("challenge_date", since);
    const claimed = new Set((claims || []).map((c: any) => c.challenge_key));
    const challenges = ARENA_DAILY_CHALLENGES.map((c) => {
      const progress = (metrics as any)[c.metric] as number;
      return {
        key: c.key,
        progress: Math.min(progress, c.goal),
        goal: c.goal,
        complete: progress >= c.goal,
        claimed: claimed.has(c.key),
      };
    });
    return { challenges };
  });

// ---- Claim a completed daily challenge (Arena XP + PullBid Credits) ----
export const claimArenaChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { challengeKey: string }) => d)
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const def = CHALLENGE_MAP[data.challengeKey];
    if (!def) throw new Error("Unknown challenge");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const metrics = await todaysMetrics(supabaseAdmin, userId);
    const progress = (metrics as any)[def.metric] as number;
    if (progress < def.goal) throw new Error("Challenge not complete yet");

    const today = startOfTodayUtc().slice(0, 10);
    const { error: claimErr } = await supabaseAdmin.from("arena_daily_claims").insert({
      user_id: userId, challenge_date: today, challenge_key: def.key,
      reward_xp: def.rewardXp, reward_credits: def.rewardCredits,
    });
    if (claimErr) throw new Error("Already claimed today");

    if (def.rewardCredits > 0) {
      await creditWinner(supabaseAdmin, userId, def.rewardCredits, `challenge:${def.key}`);
    }
    let xpCompanion: string | null = null;
    if (def.rewardXp > 0) {
      const { data: comp } = await supabaseAdmin
        .from("arena_companions").select("id, xp")
        .eq("user_id", userId).order("arena_rank", { ascending: false }).limit(1);
      const c = (comp || [])[0];
      if (c) {
        const newXp = (c as any).xp + def.rewardXp;
        await supabaseAdmin.from("arena_companions")
          .update({ xp: newXp, level: companionLevel(newXp) }).eq("id", (c as any).id);
        xpCompanion = (c as any).id;
      }
    }
    return { ok: true, rewardXp: def.rewardXp, rewardCredits: def.rewardCredits, xpCompanion };
  });

// ---- Cosmetics: owned + equipped + wallet balance ----
export const getArenaCosmetics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: owned } = await supabase
      .from("arena_user_cosmetics").select("cosmetic_key, cosmetic_type, equipped")
      .eq("user_id", userId);
    const { data: wallet } = await supabase
      .from("credit_wallets").select("balance").eq("user_id", userId).maybeSingle();
    return {
      owned: (owned || []).map((o: any) => ({ key: o.cosmetic_key, type: o.cosmetic_type, equipped: o.equipped })),
      balance: (wallet as any)?.balance ?? 0,
    };
  });

// ---- Buy a cosmetic with PullBid Credits ----
export const buyArenaCosmetic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { cosmeticKey: string }) => d)
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const cosmetic = COSMETIC_MAP[data.cosmeticKey];
    if (!cosmetic) throw new Error("Unknown cosmetic");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("arena_user_cosmetics").select("id")
      .eq("user_id", userId).eq("cosmetic_key", cosmetic.key).maybeSingle();
    if (existing) throw new Error("You already own this cosmetic");

    await spendCredits(supabaseAdmin, userId, cosmetic.cost, `cosmetic:${cosmetic.key}`, `Bought ${cosmetic.name}`);
    const { error } = await supabaseAdmin.from("arena_user_cosmetics").insert({
      user_id: userId, cosmetic_key: cosmetic.key, cosmetic_type: cosmetic.type,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Equip / unequip a cosmetic (one per type) ----
export const equipArenaCosmetic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { cosmeticKey: string; equipped: boolean }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const cosmetic = COSMETIC_MAP[data.cosmeticKey];
    if (!cosmetic) throw new Error("Unknown cosmetic");
    if (data.equipped) {
      // One equipped per type: clear others of the same type first.
      await supabase.from("arena_user_cosmetics")
        .update({ equipped: false })
        .eq("user_id", userId).eq("cosmetic_type", cosmetic.type);
    }
    const { error } = await supabase.from("arena_user_cosmetics")
      .update({ equipped: data.equipped })
      .eq("user_id", userId).eq("cosmetic_key", cosmetic.key);
    if (error) throw new Error(error.message);
    return { ok: true, equipped: data.equipped };
  });

// ===================================================================
// Collection-completion → Arena XP hook (digital-only).
// Completing a real-world set grants a one-time Arena XP + Credits bonus.
// Completion is verified server-side from the collection engine; each set
// can only ever be claimed once (enforced by the unique constraint).
// ===================================================================

const SET_COMPLETION_XP = 250;
const SET_COMPLETION_CREDITS = 25;

// List the user's completed sets, annotated with whether the Arena bonus
// has already been claimed.
export const getSetCompletionRewards = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { computeCollectionBooks } = await import("@/lib/collection.functions");

    const books = await computeCollectionBooks(supabaseAdmin, userId);
    const completed = books.filter((b) => b.complete);

    const { data: claims } = await supabaseAdmin
      .from("arena_set_rewards").select("set_key").eq("user_id", userId);
    const claimed = new Set((claims || []).map((c: any) => c.set_key));

    const rewards = completed.map((b) => ({
      setKey: b.key,
      setName: b.setName,
      category: b.category,
      arenaCategory: arenaCategoryFor(b.category),
      cover: b.cover,
      ownedDistinct: b.ownedDistinct,
      knownTotal: b.knownTotal,
      rewardXp: SET_COMPLETION_XP,
      rewardCredits: SET_COMPLETION_CREDITS,
      claimed: claimed.has(b.key),
    }));
    return { rewards };
  });

// Claim the one-time Arena bonus for a completed set. Re-verifies completion
// server-side so the reward can never be claimed for an incomplete set.
export const claimSetReward = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { setKey: string }) => d)
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { computeCollectionBooks } = await import("@/lib/collection.functions");

    const books = await computeCollectionBooks(supabaseAdmin, userId);
    const book = books.find((b) => b.key === data.setKey);
    if (!book || !book.complete) throw new Error("Set is not complete yet");

    const { error: claimErr } = await supabaseAdmin.from("arena_set_rewards").insert({
      user_id: userId, set_key: book.key, set_name: book.setName, category: book.category,
      reward_xp: SET_COMPLETION_XP, reward_credits: SET_COMPLETION_CREDITS,
    });
    if (claimErr) throw new Error("Reward already claimed for this set");

    await creditWinner(supabaseAdmin, userId, SET_COMPLETION_CREDITS, `set:${book.key}`);

    let xpCompanion: string | null = null;
    const { data: comp } = await supabaseAdmin
      .from("arena_companions").select("id, xp")
      .eq("user_id", userId).order("arena_rank", { ascending: false }).limit(1);
    const c = (comp || [])[0];
    if (c) {
      const newXp = (c as any).xp + SET_COMPLETION_XP;
      await supabaseAdmin.from("arena_companions")
        .update({ xp: newXp, level: companionLevel(newXp) }).eq("id", (c as any).id);
      xpCompanion = (c as any).id;
    }
    return { ok: true, rewardXp: SET_COMPLETION_XP, rewardCredits: SET_COMPLETION_CREDITS, xpCompanion };
  });

// ===================================================================
// Battle replay viewer + Arena social feed (digital-only, presentational).
// Replays rehydrate a saved battle log into the staged viewer. The feed lets
// collectors share battles, like, and comment — a reason to WATCH battles.
// ===================================================================

type ReplayLog = Array<{ round: number; mine: number; theirs: number; winner: "mine" | "theirs" }>;

// Rebuild a StageResult-shaped payload from a stored battle, from the
// signed-in user's perspective (flips the log if the user was the opponent).
export const getBattleReplay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { battleId: string }) => d)
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: b, error } = await supabaseAdmin
      .from("arena_battles").select("*").eq("id", data.battleId).maybeSingle();
    if (error || !b) throw new Error("Battle not found");

    const iAmChallenger = b.challenger_id === userId;
    const iAmOpponent = b.opponent_id === userId;
    if (!iAmChallenger && !iAmOpponent) throw new Error("This is not your battle");

    const ids = [b.challenger_companion_id, b.opponent_companion_id].filter(Boolean) as string[];
    const { data: comps } = await supabaseAdmin
      .from("arena_companions").select("id, name, image_url").in("id", ids);
    const cmap = new Map((comps || []).map((c: any) => [c.id, c]));
    const challengerC = cmap.get(b.challenger_companion_id) as any;
    const opponentC = b.opponent_companion_id ? (cmap.get(b.opponent_companion_id) as any) : null;

    // The stored log is always from the challenger's perspective ("mine").
    const rawLog = (b.log || []) as ReplayLog;
    const log: ReplayLog = iAmChallenger
      ? rawLog
      : rawLog.map((r) => ({ round: r.round, mine: r.theirs, theirs: r.mine, winner: r.winner === "mine" ? "theirs" : "mine" }));

    let myRounds = 0, theirRounds = 0;
    for (const r of log) { if (r.winner === "mine") myRounds++; else theirRounds++; }
    const iWon = b.winner_companion_id != null
      && ((iAmChallenger && b.winner_companion_id === b.challenger_companion_id)
        || (iAmOpponent && b.winner_companion_id === b.opponent_companion_id));

    const myCompanion = iAmChallenger ? challengerC : opponentC;
    const oppCompanion = iAmChallenger ? opponentC : challengerC;
    const isPve = b.battle_type === "pve";

    return {
      battleId: b.id,
      isTraining: isPve,
      myName: myCompanion?.name ?? "Your companion",
      myImage: (myCompanion?.image_url ?? null) as string | null,
      result: {
        iWon,
        myRounds,
        theirRounds,
        log,
        rewards: { xp: 0, trophies: 0, rank: 0, credits: 0 },
        opponentName: isPve ? "Training Opponent" : (oppCompanion?.name ?? "Opponent"),
        opponentImage: (oppCompanion?.image_url ?? null) as string | null,
        newBadges: [] as ArenaBadgeKey[],
      },
    };
  });

// ---- Share a battle to the Arena feed ----
export const postBattleToFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    battleId?: string | null; caption?: string; won: boolean;
    opponentName?: string | null; companionName?: string | null; imageUrl?: string | null;
  }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const caption = (data.caption ?? "").trim().slice(0, 280);
    const { data: row, error } = await supabase.from("arena_feed_posts").insert({
      user_id: userId,
      battle_id: data.battleId ?? null,
      caption: caption || null,
      won: !!data.won,
      opponent_name: data.opponentName ?? null,
      companion_name: data.companionName ?? null,
      image_url: data.imageUrl ?? null,
    }).select("id").maybeSingle();
    if (error) throw new Error(error.message);
    return { ok: true, postId: row?.id ?? null };
  });

// ---- Arena feed (recent shared battles) with liked-by-me + author profile ----
export const getArenaFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: posts, error } = await supabaseAdmin
      .from("arena_feed_posts").select("*")
      .order("created_at", { ascending: false }).limit(40);
    if (error) throw new Error(error.message);
    const rows = (posts || []) as any[];
    if (rows.length === 0) return { posts: [] as any[] };

    const postIds = rows.map((p) => p.id);
    const authorIds = [...new Set(rows.map((p) => p.user_id))];

    const [{ data: profiles }, { data: myLikes }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, username, avatar_url").in("id", authorIds),
      supabaseAdmin.from("arena_feed_likes").select("post_id").eq("user_id", userId).in("post_id", postIds),
    ]);
    const pmap = new Map((profiles || []).map((p: any) => [p.id, p]));
    const liked = new Set((myLikes || []).map((l: any) => l.post_id));

    return {
      posts: rows.map((p) => {
        const author = pmap.get(p.user_id) as any;
        return {
          id: p.id,
          battle_id: p.battle_id,
          caption: p.caption,
          won: p.won,
          opponent_name: p.opponent_name,
          companion_name: p.companion_name,
          image_url: p.image_url,
          like_count: p.like_count,
          comment_count: p.comment_count,
          created_at: p.created_at,
          user_id: p.user_id,
          username: author?.username ?? "Collector",
          avatar_url: author?.avatar_url ?? null,
          likedByMe: liked.has(p.id),
          isMine: p.user_id === userId,
        };
      }),
    };
  });

// ---- Like / unlike a feed post ----
export const likeFeedPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { postId: string; like: boolean }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    if (data.like) {
      const { error } = await supabase.from("arena_feed_likes")
        .upsert({ post_id: data.postId, user_id: userId }, { onConflict: "post_id,user_id" });
      if (error) throw new Error(error.message);
      return { liked: true };
    }
    const { error } = await supabase.from("arena_feed_likes")
      .delete().eq("post_id", data.postId).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { liked: false };
  });

// ---- Comments on a feed post (read) ----
export const getFeedComments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { postId: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("arena_feed_comments").select("*").eq("post_id", data.postId)
      .order("created_at", { ascending: true }).limit(100);
    if (error) throw new Error(error.message);
    const list = (rows || []) as any[];
    const ids = [...new Set(list.map((c) => c.user_id))];
    const { data: profiles } = ids.length
      ? await supabaseAdmin.from("profiles").select("id, username, avatar_url").in("id", ids)
      : { data: [] as any[] };
    const pmap = new Map((profiles || []).map((p: any) => [p.id, p]));
    return {
      comments: list.map((c) => {
        const p = pmap.get(c.user_id) as any;
        return {
          id: c.id, body: c.body, created_at: c.created_at, user_id: c.user_id,
          username: p?.username ?? "Collector", avatar_url: p?.avatar_url ?? null,
        };
      }),
    };
  });

// ---- Add a comment to a feed post ----
export const commentOnFeedPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { postId: string; body: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const body = (data.body ?? "").trim().slice(0, 280);
    if (!body) throw new Error("Comment cannot be empty");
    const { error } = await supabase.from("arena_feed_comments")
      .insert({ post_id: data.postId, user_id: userId, body });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
