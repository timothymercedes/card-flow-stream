import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Gift, Sparkles } from "lucide-react";

// Branded "Appreciation Gift" countdown chip — visually distinct from the bid timer.
// Gold + violet gradient with a circular SVG progress ring so viewers instantly
// recognize it's a giveaway (not the auction clock).
export function GiveawayChip({ streamId }: { streamId: string }) {
  const [g, setG] = useState<any>(null);
  const [now, setNow] = useState(Date.now());

  // Tick every 250ms for a smooth ring sweep.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("giveaways")
        .select("*")
        .eq("stream_id", streamId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) setG(data || null);
    }
    load();
    const ch = supabase
      .channel(`giveaway-chip-${streamId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "giveaways", filter: `stream_id=eq.${streamId}` },
        (p) => setG((p.new as any) || (p.old as any) || null),
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [streamId]);

  if (!g || g.status !== "open" || !g.ends_at || !g.starts_at) return null;
  const startedMs = new Date(g.starts_at).getTime();
  const endsMs = new Date(g.ends_at).getTime();
  const totalMs = Math.max(1, endsMs - startedMs);
  const remaining = Math.max(0, endsMs - now);
  if (remaining <= 0) return null;

  const secs = Math.ceil(remaining / 1000);
  const pct = Math.min(1, Math.max(0, remaining / totalMs));
  const urgent = remaining <= 8000;

  // SVG ring math
  const size = 44;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * pct;

  return (
    <div className="relative">
      {/* Outer glow halo */}
      <div
        className={`pointer-events-none absolute inset-0 rounded-full blur-md ${
          urgent ? "bg-rose-500/60 animate-pulse" : "bg-amber-400/40"
        }`}
        aria-hidden
      />
      <div
        className={`relative flex items-center gap-1.5 rounded-full p-[2px] shadow-xl ring-1 ring-white/30 backdrop-blur ${
          urgent
            ? "bg-gradient-to-br from-rose-400 via-rose-500 to-fuchsia-600 animate-pulse"
            : "bg-gradient-to-br from-amber-300 via-amber-500 to-violet-600"
        }`}
        title={`${g.prize_label} — type !enter in chat`}
      >
        <div className="flex items-center gap-1.5 rounded-full bg-black/70 pl-1.5 pr-2.5 py-0.5">
          {/* Circular progress ring with gift icon */}
          <div className="relative" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
              <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke="rgba(255,255,255,0.15)"
                strokeWidth={stroke}
              />
              <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={urgent ? "#fda4af" : "#fcd34d"}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${dash} ${c}`}
                style={{ transition: "stroke-dasharray 250ms linear" }}
              />
            </svg>
            <Gift
              className={`absolute inset-0 m-auto h-4 w-4 ${
                urgent ? "text-rose-200" : "text-amber-200"
              }`}
            />
          </div>
          <div className="flex flex-col items-start leading-none">
            <span className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-wide text-amber-200/90">
              <Sparkles className="h-2.5 w-2.5" /> Gift
            </span>
            <span className="text-sm font-extrabold tabular-nums text-white">
              {secs}s
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
