import { supabase } from "@/integrations/supabase/client";

/**
 * Progression helpers — thin wrappers over the SECURITY DEFINER RPCs.
 * Use these from any feature flow (bid placed, sale completed, story posted)
 * to grant XP / advance quests. The RPCs handle level math + audit log.
 */

export type AwardXpResult = { new_xp: number; new_level: number; leveled_up: boolean };
export type DailyLoginResult = { streak: number; xp_awarded: number; already_claimed: boolean };
export type QuestBumpResult = { progress: number; target: number; completed: boolean; xp_awarded: number };

/** Award XP to the current user. Reasons: 'bid', 'win', 'sale', 'story', 'follow', 'tip', 'share', etc. */
export async function awardXp(amount: number, reason: string, refId?: string): Promise<AwardXpResult | null> {
  const { data, error } = await (supabase.rpc as any)("award_xp", {
    _amount: amount,
    _reason: reason,
    _ref_id: refId ?? null,
  });
  if (error) { console.warn("[xp] award failed", error.message); return null; }
  return (Array.isArray(data) ? data[0] : data) as AwardXpResult;
}

/** Claim today's daily-login bonus. Idempotent — returns already_claimed=true if already done today. */
export async function claimDailyLogin(): Promise<DailyLoginResult | null> {
  const { data, error } = await (supabase.rpc as any)("claim_daily_login");
  if (error) { console.warn("[xp] daily login failed", error.message); return null; }
  return (Array.isArray(data) ? data[0] : data) as DailyLoginResult;
}

/** Advance a daily/weekly quest (e.g. 'daily_bid'). Auto-awards XP on completion. */
export async function bumpQuest(slug: string, delta = 1): Promise<QuestBumpResult | null> {
  const { data, error } = await (supabase.rpc as any)("bump_quest_progress", {
    _slug: slug,
    _delta: delta,
  });
  if (error) { console.warn("[xp] quest bump failed", error.message); return null; }
  return (Array.isArray(data) ? data[0] : data) as QuestBumpResult;
}

/** XP needed to reach next level given current xp. Mirrors SQL: level n = sqrt(xp/100)+1 */
export function xpForLevel(level: number): number { return (level - 1) * (level - 1) * 100; }
export function progressToNextLevel(xp: number): { level: number; pct: number; current: number; needed: number } {
  const level = Math.max(1, Math.floor(Math.sqrt(xp / 100)) + 1);
  const cur = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const pct = Math.min(100, Math.round(((xp - cur) / (next - cur)) * 100));
  return { level, pct, current: xp - cur, needed: next - cur };
}
