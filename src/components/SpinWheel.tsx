import { useEffect, useMemo, useRef, useState } from "react";

export type WheelSlot = {
  id: string;
  label: string;
  weight: number;
  color: string;
  is_active: boolean;
};

type Props = {
  slots: WheelSlot[];
  // When set: spin to land on this slot, finishing at finishAt timestamp.
  spinning: boolean;
  targetSlotId: string | null;
  startedAt: number | null;
  finishAt: number | null;
  size?: number;
  onLanded?: (slotId: string) => void;
};

// Pure SVG wheel — pointer at top (12 o'clock).
export function SpinWheel({ slots, spinning, targetSlotId, startedAt, finishAt, size = 280, onLanded }: Props) {
  const active = useMemo(() => slots.filter((s) => s.is_active), [slots]);
  const [angle, setAngle] = useState(0);
  const rafRef = useRef<number | null>(null);
  const landedRef = useRef<string | null>(null);

  // Compute target angle so the chosen slot's center sits at the top pointer.
  // Each slot occupies 360/active.length degrees, centered at i*step + step/2.
  const targetAngle = useMemo(() => {
    if (!targetSlotId || active.length === 0) return null;
    const idx = active.findIndex((s) => s.id === targetSlotId);
    if (idx < 0) return null;
    const step = 360 / active.length;
    const slotCenter = idx * step + step / 2;
    // Wheel rotates clockwise by `angle`. Pointer is at 0deg (top).
    // To bring slotCenter to 0deg after rotation, rotation = -slotCenter (mod 360).
    const base = (360 - slotCenter) % 360;
    // Add several full turns for drama.
    return 360 * 6 + base;
  }, [targetSlotId, active]);

  // Animate from 0 → targetAngle between startedAt and finishAt with ease-out.
  useEffect(() => {
    if (!spinning || targetAngle == null || !startedAt || !finishAt) return;
    landedRef.current = null;
    const dur = Math.max(800, finishAt - startedAt);

    function ease(t: number) {
      // Ease-out cubic
      return 1 - Math.pow(1 - t, 3);
    }
    function step() {
      const now = Date.now();
      const t = Math.min(1, (now - startedAt!) / dur);
      const a = ease(t) * (targetAngle as number);
      setAngle(a);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        if (targetSlotId && landedRef.current !== targetSlotId) {
          landedRef.current = targetSlotId;
          onLanded?.(targetSlotId);
        }
      }
    }
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning, targetAngle, startedAt, finishAt]);

  // When idle, settle on the last-known target so winner stays at top.
  useEffect(() => {
    if (!spinning && targetAngle != null) {
      // Snap to final resting angle (without the 6 spins) to avoid huge transforms.
      const settled = ((targetAngle as number) % 360 + 360) % 360;
      setAngle(settled);
    }
    if (!spinning && targetAngle == null) setAngle(0);
  }, [spinning, targetAngle]);

  const r = size / 2;
  const cx = r;
  const cy = r;

  if (active.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-full border-4 border-dashed border-white/20 text-center text-xs text-white/60" style={{ width: size, height: size }}>
        Add slots to spin
      </div>
    );
  }

  // Build slice paths
  const step = (Math.PI * 2) / active.length;
  const slices = active.map((s, i) => {
    const a0 = -Math.PI / 2 + i * step; // start at top
    const a1 = a0 + step;
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const large = step > Math.PI ? 1 : 0;
    const d = `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
    // Label position
    const aMid = a0 + step / 2;
    const lx = cx + r * 0.62 * Math.cos(aMid);
    const ly = cy + r * 0.62 * Math.sin(aMid);
    const rotDeg = (aMid * 180) / Math.PI + 90;
    return { d, color: s.color, label: s.label, lx, ly, rotDeg, key: s.id };
  });

  // Index of the slice that's currently sitting at the top pointer (visual feedback)
  const pointedIdx = useMemo(() => {
    if (active.length === 0) return -1;
    const stepDeg = 360 / active.length;
    // The slice whose center is at angle 0 after wheel rotation = (-angle/step) mod n, offset by half step
    const norm = ((360 - (angle % 360)) % 360);
    return Math.floor((norm + stepDeg / 2) / stepDeg) % active.length;
  }, [angle, active]);

  return (
    <div className="relative" style={{ width: size + 24, height: size + 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {/* Outer rim ring */}
      <div className="absolute inset-0 rounded-full" style={{ background: "radial-gradient(circle at 50% 0%, hsl(var(--primary)/0.55), transparent 60%)" }} />

      {/* NEEDLE / POINTER — large arrow at the top, points DOWN into the wheel */}
      <div
        className="absolute left-1/2 z-20 -translate-x-1/2"
        style={{ top: 0 }}
      >
        <svg width="44" height="56" viewBox="0 0 44 56" style={{ filter: "drop-shadow(0 4px 8px rgba(0,0,0,.6))" }}>
          {/* Knob */}
          <circle cx="22" cy="10" r="9" fill="hsl(var(--primary))" stroke="#fff" strokeWidth="2" />
          {/* Arrow body pointing down */}
          <path d="M 22 54 L 6 18 Q 22 26 38 18 Z" fill="hsl(var(--primary))" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </div>

      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: `rotate(${angle}deg)`, transition: "none", filter: "drop-shadow(0 8px 24px rgba(0,0,0,.45))" }}>
        <circle cx={cx} cy={cy} r={r - 2} fill="#0b0b0b" />
        {slices.map((sl, i) => {
          const highlighted = i === pointedIdx;
          return (
            <g key={sl.key}>
              <path
                d={sl.d}
                fill={sl.color}
                stroke={highlighted ? "#fff" : "rgba(0,0,0,.35)"}
                strokeWidth={highlighted ? 3 : 1}
                style={highlighted ? { filter: "brightness(1.25)" } : undefined}
              />
              <text
                x={sl.lx}
                y={sl.ly}
                fill="#fff"
                fontSize={Math.max(10, size / 22)}
                fontWeight={800}
                textAnchor="middle"
                dominantBaseline="middle"
                transform={`rotate(${sl.rotDeg} ${sl.lx} ${sl.ly})`}
                style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,.6)", strokeWidth: 2 }}
              >
                {sl.label.length > 14 ? sl.label.slice(0, 13) + "…" : sl.label}
              </text>
            </g>
          );
        })}
        {/* Tick marks between slices for that satisfying click feel */}
        {slices.map((_, i) => {
          const a = -Math.PI / 2 + i * step;
          const x1 = cx + (r - 2) * Math.cos(a);
          const y1 = cy + (r - 2) * Math.sin(a);
          const x2 = cx + (r - 10) * Math.cos(a);
          const y2 = cy + (r - 10) * Math.sin(a);
          return <line key={`tick-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff" strokeWidth={2} opacity={0.6} />;
        })}
        <circle cx={cx} cy={cy} r={size * 0.09} fill="hsl(var(--primary))" stroke="#fff" strokeWidth={3} />
      </svg>
    </div>
  );
}

// Weighted pick helper exported for callers.
export function weightedPick(slots: WheelSlot[]): WheelSlot | null {
  const active = slots.filter((s) => s.is_active && s.weight > 0);
  if (active.length === 0) return null;
  const total = active.reduce((a, s) => a + s.weight, 0);
  let r = Math.random() * total;
  for (const s of active) { r -= s.weight; if (r <= 0) return s; }
  return active[active.length - 1];
}
