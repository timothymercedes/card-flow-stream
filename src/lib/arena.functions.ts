// PullBid Arena — server functions. Real cards are NEVER at risk; only digital
// companions, XP, ranks, trophies and cosmetics are affected by anything here.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  titleForWins, communityForCategory, deriveCompanionStats, valueTier,
  companionLevel, DIFFICULTY_META, type ArenaTitle, type ArenaDifficulty,
} from "@/lib/arenaShared";

type CompanionRow = {
  id: string; user_id: string; vault_card_id: string; name: string;
  category: string | null; community: string; image_url: string | null;
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
    community: c.community, image_url: c.image_url,
    wins: c.wins, losses: c.losses,
    win_rate: total > 0 ? Math.round((c.wins / total) * 1000) / 10 : 0,
    title: c.title, trophies: c.trophies, arena_rank: c.arena_rank,
    longest_win_streak: c.longest_win_streak,
  };
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
// Core query logic, extracted so it can be exercised in integration tests
// without the server-function/runtime layer. `admin` is a Supabase client.
export async function fetchOpponentsCore(
  admin: { from: (t: string) => any },
  userId: string,
  community?: string,
) {
  let q = admin.from("arena_companions").select("*").neq("user_id", userId).limit(40);
  if (community && community !== "general") q = q.eq("community", community);
  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);
  // Shuffle and take up to 12
  const arr = (rows || []) as unknown as CompanionRow[];
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return { opponents: arr.slice(0, 12).map(publicProjection) };
}

export const findOpponents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { community?: string }) => d ?? {})
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return fetchOpponentsCore(supabaseAdmin, userId, data.community);
  });


function power(c: { attack: number; defense: number; speed: number; level: number }): number {
  const base = c.attack * 1.0 + c.defense * 0.8 + c.speed * 0.6 + c.level * 5;
  const luck = 0.85 + Math.random() * 0.3; // 0.85 – 1.15
  return base * luck;
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

    // Best of 3 rounds.
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

    // Winner updates
    const wWins = winner.wins + 1;
    const wStreak = winner.win_streak + 1;
    const wXp = winner.xp + 50;
    const winnerUpdate = {
      wins: wWins,
      win_streak: wStreak,
      longest_win_streak: Math.max(winner.longest_win_streak, wStreak),
      season_wins: winner.season_wins + 1,
      trophies: winner.trophies + 10,
      arena_rank: winner.arena_rank + 15,
      xp: wXp,
      level: companionLevel(wXp),
      title: titleForWins(wWins),
    };
    // Loser updates
    const lXp = loser.xp + 15;
    const loserUpdate = {
      losses: loser.losses + 1,
      win_streak: 0,
      trophies: loser.trophies + 2,
      arena_rank: Math.max(0, loser.arena_rank - 10),
      xp: lXp,
      level: companionLevel(lXp),
    };

    await supabaseAdmin.from("arena_companions").update(winnerUpdate).eq("id", winner.id);
    await supabaseAdmin.from("arena_companions").update(loserUpdate).eq("id", loser.id);

    const { data: season } = await supabaseAdmin
      .from("arena_seasons").select("id").eq("active", true).maybeSingle();

    await supabaseAdmin.from("arena_battles").insert({
      challenger_id: me.user_id,
      opponent_id: them.user_id,
      challenger_companion_id: me.id,
      opponent_companion_id: them.id,
      winner_companion_id: winner.id,
      status: "resolved",
      log,
      season_id: season?.id ?? null,
    });

    return {
      iWon,
      myRounds,
      theirRounds,
      log,
      rewards: iWon
        ? { xp: 50, trophies: 10, rank: 15 }
        : { xp: 15, trophies: 2, rank: -10 },
      opponentName: them.name,
    };
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
    const update: Record<string, unknown> = {
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
      rewards: { xp: gainedXp, trophies: iWon ? diff.winTrophies : 0, rank: 0 },
      opponentName: `${cpuName} (${diff.label})`,
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

// ---- Leaderboards (seasonal) ----
export const getLeaderboards = createServerFn({ method: "GET" })
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [mostWins, longestStreak] = await Promise.all([
      supabaseAdmin.from("arena_companions").select("*").order("wins", { ascending: false }).limit(20),
      supabaseAdmin.from("arena_companions").select("*").order("longest_win_streak", { ascending: false }).limit(20),
    ]);
    const projW = ((mostWins.data || []) as unknown as CompanionRow[]).map(publicProjection);
    const projS = ((longestStreak.data || []) as unknown as CompanionRow[]).map(publicProjection);

    // Top trainers: aggregate season_wins by user.
    const { data: all } = await supabaseAdmin
      .from("arena_companions").select("user_id, season_wins, wins, trophies");
    const byUser = new Map<string, { user_id: string; season_wins: number; wins: number; trophies: number }>();
    for (const r of (all || []) as any[]) {
      const e = byUser.get(r.user_id) || { user_id: r.user_id, season_wins: 0, wins: 0, trophies: 0 };
      e.season_wins += r.season_wins; e.wins += r.wins; e.trophies += r.trophies;
      byUser.set(r.user_id, e);
    }
    const trainers = [...byUser.values()].sort((a, b) => b.season_wins - a.season_wins).slice(0, 20);

    return { mostWins: projW, longestStreak: projS, topTrainers: trainers };
  });
