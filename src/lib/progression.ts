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

export type CrateReward = {
  reward_slug: string | null;
  reward_name: string | null;
  kind: string | null;
  rarity: string | null;
  value: string | null;
  icon: string | null;
  xp_bonus: number;
  already_opened: boolean;
  is_new: boolean;
};

/** Open today's free daily crate. Idempotent — already_opened=true if claimed today. */
export async function openDailyCrate(): Promise<CrateReward | null> {
  const { data, error } = await (supabase.rpc as any)("open_daily_crate");
  if (error) { console.warn("[crate] open failed", error.message); return null; }
  return (Array.isArray(data) ? data[0] : data) as CrateReward;
}

export const RARITY_STYLE: Record<string, { ring: string; text: string; glow: string }> = {
  common:    { ring: "ring-slate-400",   text: "text-slate-500",   glow: "from-slate-400/20 to-slate-500/10" },
  rare:      { ring: "ring-sky-400",     text: "text-sky-500",     glow: "from-sky-400/20 to-cyan-500/10" },
  epic:      { ring: "ring-fuchsia-400", text: "text-fuchsia-500", glow: "from-fuchsia-400/20 to-violet-500/10" },
  legendary: { ring: "ring-amber-400",   text: "text-amber-500",   glow: "from-amber-400/30 to-orange-500/15" },
};

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

/**
 * levelTheme — fun color per level. Cycles through a vibrant palette so every
 * level-up visibly changes the XP chip color in the header.
 */
const LEVEL_GRADIENTS = [
  "from-sky-500 to-cyan-500",        // Lv 1
  "from-emerald-500 to-teal-500",    // Lv 2
  "from-amber-500 to-orange-500",    // Lv 3
  "from-fuchsia-500 to-pink-500",    // Lv 4
  "from-violet-500 to-indigo-500",   // Lv 5
  "from-rose-500 to-red-500",        // Lv 6
  "from-lime-500 to-emerald-500",    // Lv 7
  "from-yellow-400 to-amber-500",    // Lv 8
  "from-blue-500 to-violet-600",     // Lv 9
  "from-amber-400 via-fuchsia-500 to-violet-600", // Lv 10+ (rainbow / prestige)
];
export function levelTheme(level: number): { gradient: string } {
  const idx = Math.min(LEVEL_GRADIENTS.length - 1, Math.max(0, level - 1));
  return { gradient: LEVEL_GRADIENTS[idx] };
}
