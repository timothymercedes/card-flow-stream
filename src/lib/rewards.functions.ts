// PullBid Live — Rewards engine server functions.
// Connects Collection Books, achievements, milestones, and the PullBid Credits
// wallet into a single Rewards Center. All credit/claim mutations are
// server-authoritative: completion is re-verified here before the SECURITY
// DEFINER `claim_reward` RPC grants anything, so claims cannot be forged.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { computeCollectionBooks } from "@/lib/collection.functions";

export type RewardStatus =
  | "in_progress"
  | "unlocked"
  | "ready_to_claim"
  | "claimed"
  | "expired";

// ---------- Sync collector progress (set completion + milestones) ----------
// Recomputes set completion from the vault and writes reward_claims progress so
// the Rewards Center shows accurate "In Progress" and "Ready to claim" states.
export const syncCollectorRewards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, supabase } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const books = await computeCollectionBooks(supabaseAdmin, userId);
    // Only sets with an official total participate in completion rewards.
    const official = books.filter((b) => b.official && b.knownTotal > 0);
    const completed = official.filter((b) => b.complete);

    // Per-set completion reward progress (cap to keep writes bounded).
    for (const b of official.slice(0, 250)) {
      await (supabase.rpc as any)("record_reward_progress", {
        _def_slug: "set_completion",
        _progress: b.ownedDistinct,
        _target: b.knownTotal,
        _context_key: b.key,
        _context_label: b.setName,
      });
    }

    // Collector milestones (1/5/10/25/50/100 sets completed).
    const milestones = [
      ["milestone_1_set", 1],
      ["milestone_5_sets", 5],
      ["milestone_10_sets", 10],
      ["milestone_25_sets", 25],
      ["milestone_50_sets", 50],
      ["milestone_100_sets", 100],
    ] as const;
    for (const [slug, target] of milestones) {
      await (supabase.rpc as any)("record_reward_progress", {
        _def_slug: slug,
        _progress: Math.min(completed.length, target),
        _target: target,
        _context_key: "",
        _context_label: null,
      });
    }

    return { completedSets: completed.length, totalOfficialSets: official.length };
  });

// ---------- Rewards Center overview ----------
export const getRewardsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: wallet }, { data: defs }, { data: claims }, { data: ach }, { data: userAch }, { data: tx }] =
      await Promise.all([
        supabaseAdmin.from("credit_wallets").select("balance, lifetime_earned, lifetime_spent").eq("user_id", userId).maybeSingle(),
        supabaseAdmin.from("reward_definitions").select("*").eq("is_active", true).order("sort_order"),
        supabaseAdmin.from("reward_claims").select("*").eq("user_id", userId),
        supabaseAdmin.from("achievements").select("*").order("sort_order"),
        supabaseAdmin.from("user_achievements").select("achievement_id, unlocked_at").eq("user_id", userId),
        supabaseAdmin.from("credit_transactions").select("amount, balance_after, source, description, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
      ]);

    const defMap = new Map<string, any>((defs ?? []).map((d: any) => [d.id, d]));
    const unlockedAch = new Set((userAch ?? []).map((a: any) => a.achievement_id));

    const enriched = (claims ?? []).map((c: any) => {
      const def = defMap.get(c.reward_def_id);
      return {
        id: c.id,
        status: c.status as RewardStatus,
        progress: c.progress,
        target: c.target,
        contextKey: c.context_key,
        contextLabel: c.context_label,
        unlockedAt: c.unlocked_at,
        claimedAt: c.claimed_at,
        def: def
          ? {
              slug: def.slug,
              type: def.type,
              title: def.title,
              description: def.description,
              icon: def.icon,
              credits: def.credits,
              xp: def.xp,
              badge_slug: def.badge_slug,
              threshold: def.threshold,
            }
          : null,
      };
    }).filter((c) => c.def);

    const available = enriched.filter((c) => c.status === "ready_to_claim" || c.status === "unlocked");
    const inProgress = enriched.filter((c) => c.status === "in_progress");
    const redeemed = enriched.filter((c) => c.status === "claimed").sort(
      (a, b) => new Date(b.claimedAt ?? 0).getTime() - new Date(a.claimedAt ?? 0).getTime(),
    );

    const milestones = (defs ?? [])
      .filter((d: any) => d.type === "milestone")
      .map((d: any) => {
        const claim = enriched.find((c) => c.def?.slug === d.slug);
        return {
          slug: d.slug,
          title: d.title,
          description: d.description,
          icon: d.icon,
          threshold: d.threshold,
          credits: d.credits,
          xp: d.xp,
          progress: claim?.progress ?? 0,
          status: (claim?.status ?? "in_progress") as RewardStatus,
        };
      });

    const achievements = (ach ?? []).map((a: any) => ({
      slug: a.slug,
      title: a.title,
      description: a.description,
      icon: a.icon,
      category: a.category,
      xp_reward: a.xp_reward,
      is_secret: a.is_secret,
      unlocked: unlockedAch.has(a.id),
      unlockedAt: (userAch ?? []).find((u: any) => u.achievement_id === a.id)?.unlocked_at ?? null,
    }));

    return {
      wallet: {
        balance: Number(wallet?.balance ?? 0),
        lifetimeEarned: Number(wallet?.lifetime_earned ?? 0),
        lifetimeSpent: Number(wallet?.lifetime_spent ?? 0),
      },
      available,
      inProgress,
      redeemed,
      milestones,
      achievements,
      transactions: (tx ?? []).map((t: any) => ({
        amount: Number(t.amount),
        balanceAfter: Number(t.balance_after),
        source: t.source,
        description: t.description,
        createdAt: t.created_at,
      })),
      counts: {
        available: available.length,
        achievementsUnlocked: achievements.filter((a) => a.unlocked).length,
        achievementsTotal: achievements.length,
      },
    };
  });

// ---------- Claim a reward (server-authoritative) ----------
export const claimReward = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        slug: z.string().min(1).max(80),
        contextKey: z.string().max(200).optional(),
        contextLabel: z.string().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const contextKey = data.contextKey ?? "";

    const { data: def } = await supabaseAdmin
      .from("reward_definitions")
      .select("*")
      .eq("slug", data.slug)
      .eq("is_active", true)
      .maybeSingle();
    if (!def) throw new Error("Reward not available");

    // Re-verify eligibility server-side before granting.
    if (def.type === "set_completion") {
      if (!contextKey) throw new Error("Missing set");
      const books = await computeCollectionBooks(supabaseAdmin, userId);
      const book = books.find((b) => b.key === contextKey);
      if (!book || !book.complete) throw new Error("This set isn't complete yet");
    } else if (def.type === "milestone") {
      const books = await computeCollectionBooks(supabaseAdmin, userId);
      const completed = books.filter((b) => b.official && b.complete).length;
      if (completed < (def.threshold ?? Infinity)) throw new Error("Milestone not reached yet");
    } else {
      // achievement / community / event: a system must have marked it ready.
      const { data: claim } = await supabaseAdmin
        .from("reward_claims")
        .select("status")
        .eq("user_id", userId)
        .eq("reward_def_id", def.id)
        .eq("context_key", contextKey)
        .maybeSingle();
      if (!claim || (claim.status !== "ready_to_claim" && claim.status !== "unlocked")) {
        throw new Error("Reward not ready to claim");
      }
    }

    const { data: result, error } = await (supabase.rpc as any)("claim_reward", {
      _def_slug: data.slug,
      _context_key: contextKey,
      _context_label: data.contextLabel ?? null,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(result) ? result[0] : result;
    return {
      granted: !!row?.granted,
      credits: Number(row?.credits ?? 0),
      xp: Number(row?.xp ?? 0),
      title: row?.title ?? def.title,
      description: row?.description ?? def.description,
      newBalance: Number(row?.new_balance ?? 0),
    };
  });
