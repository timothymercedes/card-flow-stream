/**
 * OfferCountdown — live per-second countdown for binding offers.
 * Shows hh:mm:ss while > 1h, mm:ss otherwise. Red+pulse under 5 minutes.
 * Emits `onExpire` once when it hits zero so parent can refresh state.
 */
import { useEffect, useState, useRef } from "react";
import { Clock } from "lucide-react";

interface Props {
  to: string;
  onExpire?: () => void;
  compact?: boolean;
}

export function OfferCountdown({ to, onExpire, compact }: Props) {
  const [now, setNow] = useState(Date.now());
  const firedRef = useRef(false);

  useEffect(() => {
    firedRef.current = false;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [to]);

  const diff = new Date(to).getTime() - now;
  if (diff <= 0) {
    if (!firedRef.current) {
      firedRef.current = true;
      onExpire?.();
    }
    return (
      <span className="inline-flex items-center gap-1 text-destructive font-bold">
        <Clock className="h-3 w-3" /> expired
      </span>
    );
  }

  const totalSec = Math.floor(diff / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const text = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  const urgent = diff < 5 * 60_000;

  return (
    <span
      className={`inline-flex items-center gap-1 tabular-nums font-bold ${
        urgent ? "text-destructive animate-pulse" : "text-foreground"
      } ${compact ? "text-xs" : "text-sm"}`}
    >
      <Clock className="h-3 w-3" /> {text}
    </span>
  );
}
