// PullBid Arena — daily challenges (client-safe definitions). Progress is
// computed server-side from the day's arena_battles; rewards are Arena XP +
// PullBid Credits, claimable once per day. Digital-only, no real cards involved.
export type ArenaChallengeMetric = "pvp_wins" | "pve_battles" | "total_battles";

export type ArenaChallenge = {
  key: string;
  label: string;
  description: string;
  metric: ArenaChallengeMetric;
  goal: number;
  rewardXp: number;
  rewardCredits: number;
  emoji: string;
};

// Fixed daily set (resets each calendar day). Expandable / rotatable later.
export const ARENA_DAILY_CHALLENGES: ArenaChallenge[] = [
  {
    key: "win_pvp_3", label: "Arena Victor",
    description: "Win 3 PVP battles today",
    metric: "pvp_wins", goal: 3, rewardXp: 60, rewardCredits: 10, emoji: "🏆",
  },
  {
    key: "train_5", label: "Daily Drills",
    description: "Complete 5 training (PVE) battles",
    metric: "pve_battles", goal: 5, rewardXp: 40, rewardCredits: 5, emoji: "🛡️",
  },
  {
    key: "battle_6", label: "Always Battling",
    description: "Fight 6 battles of any kind",
    metric: "total_battles", goal: 6, rewardXp: 30, rewardCredits: 8, emoji: "⚔️",
  },
];

export const CHALLENGE_MAP: Record<string, ArenaChallenge> =
  Object.fromEntries(ARENA_DAILY_CHALLENGES.map((c) => [c.key, c]));
