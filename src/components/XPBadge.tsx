import { Link } from "@tanstack/react-router";
import { Zap } from "lucide-react";
import { useProgression } from "@/hooks/useProgression";
import { progressToNextLevel } from "@/lib/progression";

/**
 * XPBadge — compact level chip in the top header.
 * Click → /quests (progression dashboard with XP, achievements, quests, streaks).
 */
export function XPBadge() {
  const { progression } = useProgression();
  if (!progression) return null;
  const { level, pct } = progressToNextLevel(progression.xp);

  return (
    <Link
      to="/quests"
      aria-label={`Level ${level}, ${pct}% to next level. Open progression`}
      title={`Lv ${level} · ${pct}% to next${progression.login_streak >= 2 ? ` · 🔥${progression.login_streak}d streak` : ""}`}
      className="group relative flex h-8 items-center gap-1 rounded-full bg-muted px-2 text-[10px] font-bold text-foreground ring-1 ring-border transition hover:bg-accent"
    >
      <Zap className="h-3 w-3 text-amber-500" aria-hidden="true" />
      <span>Lv {level}</span>
      <span className="ml-0.5 hidden h-1 w-8 overflow-hidden rounded-full bg-background sm:block">
        <span className="block h-full bg-gradient-to-r from-amber-500 to-fuchsia-500 transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </span>
    </Link>
  );
}
