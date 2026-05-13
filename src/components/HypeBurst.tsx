import { useEffect, useRef, useState } from "react";
import { Flame } from "lucide-react";

/**
 * HypeBurst — listens to bid timestamps and fires a screen-shake + confetti
 * burst when 3+ bids land in 5 seconds. Pass `lastBidAt` (any monotonic
 * string/number that changes per bid). Renders nothing when not hyped.
 */
export function HypeBurst({ lastBidAt }: { lastBidAt: string | number | null | undefined }) {
  const recent = useRef<number[]>([]);
  const [hype, setHype] = useState(false);

  useEffect(() => {
    if (lastBidAt === null || lastBidAt === undefined || lastBidAt === "") return;
    const now = Date.now();
    recent.current = [...recent.current.filter((t) => now - t < 5000), now];
    if (recent.current.length >= 3 && !hype) {
      setHype(true);
      const t = setTimeout(() => {
        setHype(false);
        recent.current = [];
      }, 1800);
      return () => clearTimeout(t);
    }
  }, [lastBidAt, hype]);

  if (!hype) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[55] flex items-start justify-center pt-24">
      <div className="animate-[hype-shake_0.4s_ease-in-out_infinite] flex items-center gap-2 rounded-full bg-gradient-to-r from-orange-500 via-red-500 to-fuchsia-600 px-5 py-2 text-sm font-extrabold uppercase tracking-widest text-white shadow-2xl ring-2 ring-white/40">
        <Flame className="h-5 w-5 animate-pulse" /> Bid war 🔥
      </div>
    </div>
  );
}
