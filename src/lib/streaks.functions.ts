// PullBid Live — Collection Streaks.
// Rewards users for staying active: vaulting cards, completing sets, finding
// or trading for missing cards. One activity per UTC day advances the streak;
// missing a day resets it. Streaks are public so they can appear on profiles.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type StreakState = {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
  totalActivities: number;
  activeToday: boolean;
  nextMilestone: number | null;
};

const MILESTONES = [3, 7, 14, 30, 60, 100, 365];

function shape(row: any): StreakState {
  const today = new Date().toISOString().slice(0, 10);
  const current = Number(row?.current_streak ?? 0);
  const next = MILESTONES.find((m) => m > current) ?? null;
  return {
    currentStreak: current,
    longestStreak: Number(row?.longest_streak ?? 0),
    lastActivityDate: row?.last_activity_date ?? null,
    totalActivities: Number(row?.total_activities ?? 0),
    activeToday: row?.last_activity_date === today,
    nextMilestone: next,
  };
}

// Read the current user's streak (no mutation).
export const getCollectionStreak = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StreakState> => {
    const { userId, supabase } = context;
    const { data } = await supabase
      .from("collection_streaks")
      .select("current_streak, longest_streak, last_activity_date, total_activities")
      .eq("user_id", userId)
      .maybeSingle();
    return shape(data);
  });

// Record a collection activity for today (login / vault / set progress).
// Idempotent per day — calling repeatedly only counts once.
export const recordCollectionActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StreakState & { gained: boolean }> => {
    const { userId, supabase } = context;
    const { data, error } = await supabase.rpc("record_collection_activity", {
      _user_id: userId,
    });
    if (error) {
      // Non-fatal: surface a safe fallback so the UI never crashes.
      console.error("record_collection_activity failed:", error.message);
      const { data: existing } = await supabase
        .from("collection_streaks")
        .select("current_streak, longest_streak, last_activity_date, total_activities")
        .eq("user_id", userId)
        .maybeSingle();
      return { ...shape(existing), gained: false };
    }
    const row = Array.isArray(data) ? data[0] : data;
    return {
      ...shape({
        current_streak: row?.current_streak,
        longest_streak: row?.longest_streak,
        last_activity_date: new Date().toISOString().slice(0, 10),
        total_activities: undefined,
      }),
      gained: !!row?.gained,
    };
  });

// Public streak leaderboard (top current streaks).
export const getStreakLeaderboard = createServerFn({ method: "GET" })
  .inputValidator((d: { limit?: number }) =>
    z.object({ limit: z.number().min(1).max(50).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const limit = data.limit ?? 10;
    const { data: rows } = await supabaseAdmin
      .from("collection_streaks")
      .select("user_id, current_streak, longest_streak")
      .gt("current_streak", 0)
      .order("current_streak", { ascending: false })
      .limit(limit);
    const ids = (rows ?? []).map((r: any) => r.user_id);
    const profiles = new Map<string, any>();
    if (ids.length) {
      const { data: ps } = await supabaseAdmin
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", ids);
      (ps ?? []).forEach((p: any) => profiles.set(p.user_id, p));
    }
    return (rows ?? []).map((r: any) => ({
      userId: r.user_id,
      currentStreak: r.current_streak,
      longestStreak: r.longest_streak,
      displayName: profiles.get(r.user_id)?.display_name ?? "Collector",
      avatarUrl: profiles.get(r.user_id)?.avatar_url ?? null,
    }));
  });
