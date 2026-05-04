import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Gift } from "lucide-react";

// Small persistent chip that hovers above the chat showing the
// active Appreciation Gift countdown. Lets viewers know how many
// seconds are left + how to enter, without taking over the screen.
export function GiveawayChip({ streamId }: { streamId: string }) {
  const [g, setG] = useState<any>(null);
  const [now, setNow] = useState(Date.now());

  // Tick every 500ms so the countdown number actually moves.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
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

  if (!g || g.status !== "open" || !g.ends_at) return null;
  const remaining = Math.max(0, new Date(g.ends_at).getTime() - now);
  const secs = Math.ceil(remaining / 1000);
  if (remaining <= 0) return null;

  const urgent = remaining <= 10000;
  return (
    <div
      className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-extrabold shadow-lg backdrop-blur tabular-nums ${
        urgent
          ? "bg-red-500 text-white animate-pulse"
          : "bg-emerald-500/90 text-white"
      }`}
      title={`${g.prize_label} — type !enter in chat`}
    >
      <Gift className="h-3 w-3" />
      {secs}s
    </div>
  );
}
