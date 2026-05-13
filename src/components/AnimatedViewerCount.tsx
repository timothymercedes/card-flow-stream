import { useEffect, useRef, useState } from "react";
import { Users } from "lucide-react";

/**
 * Viewer-count pill that pulses + bumps each time the count goes up,
 * and briefly flashes the delta (e.g. "+3"). Drop-in replacement for the
 * static count UI.
 */
export function AnimatedViewerCount({
  count,
  onClick,
  className = "",
}: {
  count: number;
  onClick?: () => void;
  className?: string;
}) {
  const prev = useRef(count);
  const [delta, setDelta] = useState<number | null>(null);
  const [bump, setBump] = useState(false);

  useEffect(() => {
    const diff = count - prev.current;
    if (diff > 0) {
      setDelta(diff);
      setBump(true);
      const t1 = setTimeout(() => setBump(false), 450);
      const t2 = setTimeout(() => setDelta(null), 1500);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
    prev.current = count;
  }, [count]);

  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[10px] font-bold text-white backdrop-blur transition active:scale-95 ${
        bump ? "animate-[viewer-bump_0.45s_ease-out]" : ""
      } ${className}`}
      title="See who's watching"
    >
      <Users className={`h-3 w-3 ${bump ? "text-rose-300" : ""}`} />
      <span className="tabular-nums">{count.toLocaleString()}</span>
      {delta !== null && (
        <span className="pointer-events-none absolute -top-3 right-0 animate-[viewer-delta_1.4s_ease-out_forwards] rounded-full bg-rose-500 px-1.5 text-[9px] font-extrabold text-white shadow-md">
          +{delta}
        </span>
      )}
    </button>
  );
}
