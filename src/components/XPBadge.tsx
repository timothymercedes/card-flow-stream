import { Link } from "@tanstack/react-router";
import { Zap } from "lucide-react";
import { useProgression } from "@/hooks/useProgression";
import { progressToNextLevel, levelTheme } from "@/lib/progression";

/**
 * XPBadge — compact level chip in the top header.
 * Click → /quests (progression dashboard with XP, achievements, quests, streaks).
 * The chip color cycles per level so leveling up always feels visually rewarding.
 */
export function XPBadge() {
  const { progression } = useProgression();
  if (!progression) return null;
  const { level, pct } = progressToNextLevel(progression.xp);
  const theme = levelTheme(level);

  return (
    <Link
      to="/quests"
      aria-label={`Level ${level}, ${pct}% to next level. Open progression`}
      title={`Lv ${level} · ${pct}% to next${progression.login_streak >= 2 ? ` · 🔥${progression.login_streak}d streak` : ""}`}
      className={`group relative flex h-8 items-center gap-1 rounded-full bg-gradient-to-r ${theme.gradient} px-2 text-[10px] font-extrabold text-white shadow-sm ring-1 ring-white/20 transition hover:brightness-110`}
    >
      <Zap className="h-3 w-3 drop-shadow" aria-hidden="true" />
      <span className="drop-shadow">Lv {level}</span>
      <span className="ml-0.5 hidden h-1 w-8 overflow-hidden rounded-full bg-black/30 sm:block">
        <span className="block h-full bg-white/90 transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </span>
    </Link>
  );
}
