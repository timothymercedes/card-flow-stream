import { useEffect, useState } from "react";
import { Crown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Top Supporter badge — shows the single biggest contributor to a stream
 * combining their tip total + promotion total. Refetches when either table
 * changes via Supabase realtime.
 */
type Supporter = { username: string; total: number };

export function TopSupporterBadge({ streamId }: { streamId: string }) {
  const [top, setTop] = useState<Supporter | null>(null);

  useEffect(() => {
    if (!streamId) return;
    let alive = true;

    async function refresh() {
      const totals = new Map<string, number>();
      const usernames = new Map<string, string>();

      // Tips
      const { data: tips } = await supabase
        .from("stream_tips" as any)
        .select("sender_user_id, amount, sender_username, username")
        .eq("stream_id", streamId)
        .eq("payment_status", "succeeded");
      (tips || []).forEach((t: any) => {
        const uid = t.sender_user_id;
        if (!uid) return;
        totals.set(uid, (totals.get(uid) || 0) + Number(t.amount || 0));
        const uname = t.sender_username || t.username;
        if (uname) usernames.set(uid, uname);
      });

      // Promotions
      const { data: promos } = await supabase
        .from("stream_promotions" as any)
        .select("promoter_user_id, amount, promoter_username, username")
        .eq("stream_id", streamId)
        .eq("payment_status", "succeeded");
      (promos || []).forEach((p: any) => {
        const uid = p.promoter_user_id;
        if (!uid) return;
        totals.set(uid, (totals.get(uid) || 0) + Number(p.amount || 0));
        const uname = p.promoter_username || p.username;
        if (uname) usernames.set(uid, uname);
      });

      if (!alive) return;
      let bestId: string | null = null;
      let bestTotal = 0;
      totals.forEach((v, k) => { if (v > bestTotal) { bestTotal = v; bestId = k; } });
      setTop(bestId ? { username: usernames.get(bestId) || "supporter", total: bestTotal } : null);
    }

    refresh();
    const ch = supabase
      .channel(`top-supporter-${streamId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "stream_tips", filter: `stream_id=eq.${streamId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "stream_promotions", filter: `stream_id=eq.${streamId}` }, refresh)
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [streamId]);

  if (!top || top.total <= 0) return null;

  return (
    <span
      title={`Top supporter — has contributed $${top.total.toFixed(2)}`}
      className="shrink-0 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 px-2 py-0.5 text-[10px] font-extrabold text-black shadow-sm ring-1 ring-amber-200"
    >
      <Crown className="h-3 w-3" /> @{top.username} · ${top.total.toFixed(0)}
    </span>
  );
}
