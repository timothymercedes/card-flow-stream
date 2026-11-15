import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Layers } from "lucide-react";
import { getCJBulkStatus } from "@/lib/cjSupplier.functions";
import { REJECT_LABEL, type RejectReason } from "@/lib/suppliers/cjBulk";

const ago = (t: string | null | undefined) => { if (!t) return "never"; const s = Math.round((Date.now() - new Date(t).getTime()) / 1000); return s < 90 ? `${s}s ago` : `${Math.round(s / 60)} min ago`; };

/** Full CJ catalog scan — runs on the server every minute; this panel only shows its live status. */
export function CJBulkScan() {
  const statusFn = useServerFn(getCJBulkStatus);
  const status = useQuery({ queryKey: ["cj", "bulk"], queryFn: () => statusFn(), refetchInterval: 15000 });
  const c = status.data?.coordinator, r = status.data?.report, b = status.data?.backfill;
  const label = !c ? "Not set up" : c.status === "completed" ? "Finished" : c.status !== "running" ? c.status : c.working ? "Working now" : "Waiting for next run";
  return <section className="space-y-3 rounded-2xl bg-card p-4 ring-1 ring-border" aria-live="polite">
    <div className="flex flex-wrap items-center gap-2"><Layers className="h-5 w-5 text-primary" /><h2 className="font-bold">Full catalog scan</h2>
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">{label}</span>{c?.working && <Loader2 className="h-4 w-4 animate-spin" />}</div>
    <p className="text-xs text-muted-foreground">Runs on the server every minute, even when this page is closed. Adds products as hidden drafts; each option must pass a live CJ recheck (stock, US shipping, $2 profit) before it can be approved.</p>
    {status.data?.error && <p className="text-sm text-destructive">{status.data.error}</p>}
    {c && <p className="text-sm">Category {Math.min((c.cursor?.catIndex ?? 0) + 1, c.categoriesTotal || 1)} of {c.categoriesTotal || "—"} · page {c.cursor?.page ?? 1}, item {c.cursor?.offset ?? 0}{c.category ? ` · ${c.category}` : ""} · last run {ago(c.lastRunAt)} ({c.lastRunProcessed} products){c.lastError ? ` · last error: ${c.lastError}` : ""}</p>}
    {r && <>
      <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4 lg:grid-cols-7">{[["Discovered", r.total.discovered], ["Imported", r.total.imported], ["Duplicates", r.total.duplicate], ["Skipped", r.total.skipped], ["Rejected", r.total.rejected], ["Failed", r.total.failed], ["Drafts to review", status.data?.drafts ?? 0]].map(([l, n]) => <div key={l} className="rounded-xl bg-muted p-2"><p className="text-lg font-black">{n}</p><p className="text-[11px] text-muted-foreground">{l}</p></div>)}</div>
      {b && <p className="text-xs text-muted-foreground">Backfill of earlier drafts: {b.done ?? 0} done · {b.pending ?? 0} waiting · {b.skipped ?? 0} skipped · {b.failed ?? 0} failed</p>}
      {Object.keys(r.byCategory).length > 0 && <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left text-muted-foreground"><th className="py-1">CJ category</th><th>Found</th><th>Imported</th><th>Duplicate</th><th>Rejected</th><th>Failed</th><th>Reasons</th></tr></thead>
        <tbody>{Object.entries(r.byCategory).map(([k, x]) => <tr key={k} className="border-t border-border"><td className="py-1 font-semibold">{k}</td><td>{x.discovered}</td><td>{x.imported}</td><td>{x.duplicate}</td><td>{x.rejected}</td><td>{x.failed}</td><td>{Object.entries(x.reasons).filter(([k2]) => k2 !== "duplicate").map(([k2, n]) => `${REJECT_LABEL[k2 as RejectReason] ?? k2}: ${n}`).join(" · ") || "—"}</td></tr>)}</tbody></table></div>}
    </>}
  </section>;
}
