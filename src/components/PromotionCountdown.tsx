import { useEffect, useState } from "react";
import { Flame } from "lucide-react";

/**
 * Renders a small live-counting badge showing how much time is left on the
 * current paid promotion window for a stream. Hides itself when expired.
 */
export function PromotionCountdown({ activeUntil }: { activeUntil: string | null | undefined }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!activeUntil) return null;
  const ms = new Date(activeUntil).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const label = m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
  return (
    <span
      title="Time remaining on this paid promotion"
      className="shrink-0 inline-flex items-center gap-1 rounded-md bg-orange-500/15 px-2 py-0.5 text-[10px] font-bold text-orange-600 ring-1 ring-orange-500/40 tabular-nums"
    >
      <Flame className="h-3 w-3" /> {label}
    </span>
  );
}
