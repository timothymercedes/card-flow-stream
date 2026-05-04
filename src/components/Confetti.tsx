import { useEffect, useState } from "react";

const COLORS = [
  "var(--primary)",
  "var(--primary-glow)",
  "var(--live)",
  "#FFD166",
  "#fff",
];

export function Confetti({ count = 60, durationMs = 2200 }: { count?: number; durationMs?: number }) {
  const [shards] = useState(() =>
    Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.6,
      dur: 1.4 + Math.random() * 1.2,
      color: COLORS[i % COLORS.length],
      w: 6 + Math.random() * 6,
      h: 10 + Math.random() * 10,
      rot: Math.random() * 360,
    }))
  );
  const [show, setShow] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShow(false), durationMs);
    return () => clearTimeout(t);
  }, [durationMs]);
  if (!show) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      {shards.map((s) => (
        <span
          key={s.id}
          className="absolute confetti-fall"
          style={{
            left: `${s.left}%`,
            top: 0,
            width: s.w,
            height: s.h,
            background: s.color,
            transform: `rotate(${s.rot}deg)`,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.dur}s`,
            borderRadius: 2,
          }}
        />
      ))}
    </div>
  );
}
