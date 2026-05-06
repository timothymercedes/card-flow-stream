// Streaming-time achievement badge (silver / gold / platinum).
// Earned by total minutes streamed: 100 / 500 / 3000.

const META: Record<string, { label: string; emoji: string; color: string; ring: string }> = {
  silver:   { label: "Silver Streamer",   emoji: "🥈", color: "from-slate-300 to-slate-500",      ring: "ring-slate-200/50" },
  gold:     { label: "Gold Streamer",     emoji: "🥇", color: "from-amber-300 to-yellow-500",     ring: "ring-amber-200/50" },
  platinum: { label: "Platinum Streamer", emoji: "💎", color: "from-cyan-300 via-fuchsia-400 to-violet-500", ring: "ring-cyan-200/50" },
};

export function StreamingBadge({ tier, minutes, size = "sm" }: { tier?: string | null; minutes?: number | null; size?: "xs" | "sm" | "md" }) {
  if (!tier || tier === "none") return null;
  const m = META[tier];
  if (!m) return null;
  const cls = size === "xs"
    ? "px-1.5 py-0.5 text-[9px]"
    : size === "md"
      ? "px-2.5 py-1 text-xs"
      : "px-2 py-0.5 text-[10px]";
  return (
    <span
      title={minutes != null ? `${m.label} · ${minutes.toLocaleString()} min streamed` : m.label}
      className={`inline-flex items-center gap-1 rounded-full bg-gradient-to-r ${m.color} font-extrabold text-black shadow ring-1 ${m.ring} ${cls}`}
    >
      <span>{m.emoji}</span>
      <span className="uppercase tracking-wider">{tier}</span>
    </span>
  );
}
