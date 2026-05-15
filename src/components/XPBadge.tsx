import { Link } from "@tanstack/react-router";
import { Zap } from "lucide-react";
import { useProgression } from "@/hooks/useProgression";
import { progressToNextLevel } from "@/lib/progression";

/**
 * XPBadge — compact level chip + XP bar for the top header.
 * Hidden when signed out. Links to /profile so users can dig into stats.
 */
export function XPBadge() {
  const { progression } = useProgression();
  if (!progression) return null;
  const { level, pct } = progressToNextLevel(progression.xp);

  return (
    <Link
      to="/profile"
      aria-label={`Level ${level}, ${pct}% to next`}
      className="group relative flex h-8 items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500/90 via-orange-500/90 to-fuchsia-500/90 px-2 text-[10px] font-extrabold text-white shadow-sm ring-1 ring-white/20 transition hover:scale-105"
    >
      <Zap className="h-3 w-3" aria-hidden="true" />
      <span>Lv {level}</span>
      <span className="ml-0.5 hidden h-1 w-10 overflow-hidden rounded-full bg-black/30 sm:block">
        <span className="block h-full bg-white/90 transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </span>
      {progression.login_streak >= 2 && (
        <span className="ml-0.5 rounded-full bg-black/30 px-1 text-[9px]" title={`${progression.login_streak}-day streak`}>
          🔥{progression.login_streak}
        </span>
      )}
    </Link>
  );
}
