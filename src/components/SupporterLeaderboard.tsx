import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Crown, Trophy, Medal, ChevronDown, ChevronUp } from "lucide-react";

type Supporter = {
  buyer_id: string;
  buyer_username: string;
  total_tipped: number;
  tip_count: number;
};

/**
 * SupporterLeaderboard — top tippers in a live stream. Pulled from the
 * `stream_supporters` view (server-aggregated → no client manipulation,
 * no integrity exploit surface). Refreshes on `stream_tips` realtime.
 *
 * Compact card; collapsible to keep the live UI clean. Mobile-first.
 */
export function SupporterLeaderboard({ streamId }: { streamId: string }) {
  const [rows, setRows] = useState<Supporter[]>([]);
  const [open, setOpen] = useState(false);

  async function load() {
    const { data } = await supabase
      .from("stream_supporters" as any)
      .select("buyer_id,buyer_username,total_tipped,tip_count")
      .eq("stream_id", streamId)
      .order("total_tipped", { ascending: false })
      .limit(5);
    setRows(((data as any) || []) as Supporter[]);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`supporters-${streamId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "stream_tips", filter: `stream_id=eq.${streamId}` },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamId]);

  if (rows.length === 0) return null;

  const top = rows[0];
  const medals = [Crown, Trophy, Medal];

  return (
    <div className="rounded-2xl border border-border bg-card/90 backdrop-blur p-2.5 text-xs shadow-sm">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2"
      >
        <span className="flex min-w-0 items-center gap-1.5 font-extrabold uppercase tracking-widest text-muted-foreground">
          <Crown className="h-3.5 w-3.5 text-amber-500" />
          Top supporters
        </span>
        <span className="flex items-center gap-1.5">
          <span className="truncate rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-extrabold text-amber-700 dark:text-amber-300">
            @{top.buyer_username} · ${Number(top.total_tipped).toFixed(0)}
          </span>
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </span>
      </button>
      {open && (
        <ol className="mt-2 space-y-1">
          {rows.map((r, i) => {
            const Ico = medals[i] ?? Medal;
            return (
              <li key={r.buyer_id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2 py-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <Ico className={`h-3.5 w-3.5 shrink-0 ${i === 0 ? "text-amber-500" : i === 1 ? "text-slate-400" : "text-orange-700"}`} />
                  <span className="truncate font-bold">@{r.buyer_username}</span>
                </span>
                <span className="shrink-0 tabular-nums font-extrabold">${Number(r.total_tipped).toFixed(0)}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
