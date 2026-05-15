import { useEffect, useRef, useState } from "react";
import { Flame } from "lucide-react";
import { useReducedMotion } from "@/lib/motion";

/**
 * ComboBadge — floating combo counter that pops up when the user lands
 * consecutive bids in the same stream. Reads from the parent the latest
 * combo count (already returned by bumpCombo) and self-hides after 4s.
 *
 * Stays performance-friendly: single absolutely-positioned element, no
 * confetti, no high-frequency state writes; respects reduced motion.
 */
export function ComboBadge({ combo }: { combo: number | null }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState<number | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!combo || combo < 2) { setShown(null); return; }
    setShown(combo);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setShown(null), 4000);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [combo]);

  if (!shown) return null;

  const tier = shown >= 10 ? "from-red-500 via-orange-500 to-amber-400"
              : shown >= 5  ? "from-orange-500 via-amber-500 to-yellow-400"
              : "from-amber-500 to-orange-500";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none fixed bottom-24 left-1/2 z-[55] -translate-x-1/2 ${reduced ? "" : "animate-scale-in"}`}
    >
      <div className={`flex items-center gap-1.5 rounded-full bg-gradient-to-r ${tier} px-4 py-1.5 text-xs font-extrabold uppercase tracking-widest text-white shadow-xl ring-2 ring-white/30`}>
        <Flame className={`h-4 w-4 ${reduced ? "" : "animate-pulse"}`} />
        Combo ×{shown}
      </div>
    </div>
  );
}
