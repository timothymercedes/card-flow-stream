import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Play, Pause, Layers } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getCJBulkStatus, runCJBulkBatch } from "@/lib/cjSupplier.functions";
import { REJECT_LABEL, REJECT_REASONS, sumCounts } from "@/lib/suppliers/cjBulk";

/** Full CJ catalog scan: runs short slices back-to-back while this screen is open; progress is saved after every few products. */
export function CJBulkScan() {
  const qc = useQueryClient();
  const statusFn = useServerFn(getCJBulkStatus), runFn = useServerFn(runCJBulkBatch);
  const status = useQuery({ queryKey: ["cj", "bulk"], queryFn: () => statusFn(), refetchInterval: 10000 });
  const [running, setRunning] = useState(false);
  const [now, setNow] = useState<string | null>(null);
  const stop = useRef(false);
  async function run() {
    setRunning(true); stop.current = false;
    try {
      while (!stop.current) {
        const r = await runFn();
        setNow(r.category); await status.refetch();
        if (r.error) { toast.error(r.error); break; }
        if (r.done) { toast.success("Whole CJ catalog scanned."); break; }
      }
    } finally { setRunning(false); qc.invalidateQueries({ queryKey: ["bazaar-sup"] }); }
  }
  const s = status.data?.state; const t = s ? sumCounts(s.totals) : null;
  const rejected = t ? Object.values(t.rejected).reduce((n, x) => n + (x ?? 0), 0) : 0;
  return <section className="space-y-3 rounded-2xl bg-card p-4 ring-1 ring-border" aria-live="polite">
    <div className="flex flex-wrap items-center gap-2"><Layers className="h-5 w-5 text-primary" /><h2 className="font-bold">Full catalog scan</h2>
      {running ? <Button size="sm" variant="outline" onClick={() => { stop.current = true; }}><Pause />Pause after this step</Button>
        : <Button size="sm" disabled={!!s?.cursor.done || status.isLoading} onClick={() => void run()}><Play />{t?.discovered ? "Resume scan" : "Start scan"}</Button>}
      {running && <Loader2 className="h-4 w-4 animate-spin" />}</div>
    <p className="text-xs text-muted-foreground">Goes through every CJ category and page, checks photos, stock, US shipping and your $2 minimum profit, and adds qualifying products as hidden drafts. Progress is saved. Sleep-proof scheduling is not activated yet.</p>
    {status.data?.error && <p className="text-sm text-destructive">{status.data.error}</p>}
    {s && t && <>
      <p className="text-sm">Category {Math.min(s.cursor.catIndex + 1, s.categoriesTotal || 1)} of {s.categoriesTotal || "—"}{s.cursor.done ? " · finished" : ` · page ${s.cursor.page}`}{now && running ? ` · ${now}` : ""}</p>
      <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-5">{[["Discovered", t.discovered], ["Eligible", t.eligible], ["Rejected", rejected], ["Imported", t.imported], ["Drafts to review", status.data?.drafts ?? 0]].map(([l, n]) => <div key={l} className="rounded-xl bg-muted p-2"><p className="text-lg font-black">{n}</p><p className="text-[11px] text-muted-foreground">{l}</p></div>)}</div>
      {Object.keys(s.totals).length > 0 && <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left text-muted-foreground"><th className="py-1">CJ category</th><th>Found</th><th>Imported</th>{REJECT_REASONS.map((r) => <th key={r}>{REJECT_LABEL[r]}</th>)}</tr></thead>
        <tbody>{Object.entries(s.totals).map(([k, c]) => <tr key={k} className="border-t border-border"><td className="py-1 font-semibold">{k}</td><td>{c.discovered}</td><td>{c.imported}</td>{REJECT_REASONS.map((r) => <td key={r}>{c.rejected[r] ?? 0}</td>)}</tr>)}</tbody></table></div>}
    </>}
  </section>;
}
