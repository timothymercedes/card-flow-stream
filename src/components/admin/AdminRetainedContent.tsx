import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listRetainedContent, actOnRetainedContent } from "@/lib/retainedContent.functions";
import { RETAINED_FILTERS, RETENTION_DAYS, matchesRetainedFilter, retainedStatus, type RetainedFilter, type RetainedItem } from "@/lib/retainedContent";

const LABEL: Record<RetainedFilter, string> = { all: "All", active: "Active", deleted_owner: "Deleted by Owner", reported: "Reported", under_review: "Under Review", removed_admin: "Removed by Admin" };
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString() : "—");

export function AdminRetainedContent() {
  const list = useServerFn(listRetainedContent);
  const act = useServerFn(actOnRetainedContent);
  const [username, setUsername] = useState("");
  const [reason, setReason] = useState("");
  const [filter, setFilter] = useState<RetainedFilter>("all");
  const [data, setData] = useState<{ profile: { id: string; username: string } | null; items: RetainedItem[] } | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!username.trim() || reason.trim().length < 3) return toast.error("Enter a username and the review reason");
    setBusy(true);
    try { setData(await list({ data: { username, reason } })); } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  async function run(i: RetainedItem, action: "remove" | "restore_private") {
    const why = window.prompt(action === "remove" ? "Reason for removal:" : "Reason for restoring (owner-only, never public):");
    if (!why || why.trim().length < 3) return;
    try { await act({ data: { kind: i.kind, id: i.id, action, reason: why } }); toast.success("Saved and logged"); load(); } catch (e: any) { toast.error(e.message); }
  }
  const items = (data?.items || []).filter((i) => matchesRetainedFilter(i, filter));

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <h2 className="text-lg font-bold">Profile content review</h2>
        <p className="text-xs text-muted-foreground">Active and deleted posts and Stories for one member. Every lookup and action is recorded in the audit log. Deleted items are kept {RETENTION_DAYS} days, longer only while a review is open.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="@username" className="rounded-xl bg-input px-3 py-2 text-sm" />
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why are you reviewing? (required, logged)" className="rounded-xl bg-input px-3 py-2 text-sm" />
          <button onClick={load} disabled={busy} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">{busy ? "Loading…" : "Review"}</button>
        </div>
      </div>
      {data && !data.profile && <p className="text-sm text-muted-foreground">No member with that username.</p>}
      {data?.profile && (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {RETAINED_FILTERS.map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                {LABEL[f]} ({(data.items || []).filter((i) => matchesRetainedFilter(i, f)).length})
              </button>
            ))}
          </div>
          {items.length === 0 && <p className="text-sm text-muted-foreground">Nothing in this filter.</p>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((i) => {
              const st = retainedStatus(i);
              return (
                <article key={i.kind + i.id} className="overflow-hidden rounded-2xl border border-border bg-card">
                  {i.media_url ? <img src={i.media_url} alt="" className="h-44 w-full object-cover" /> : <div className="flex h-24 items-center justify-center bg-muted text-xs text-muted-foreground">No media</div>}
                  <div className="space-y-1 p-3 text-xs">
                    <div className="flex flex-wrap gap-1">
                      <span className="rounded bg-muted px-1.5 py-0.5 font-bold uppercase">{i.kind}</span>
                      {st === "deleted_owner" && <span className="rounded bg-destructive px-1.5 py-0.5 font-bold text-destructive-foreground">DELETED BY OWNER</span>}
                      {st === "removed_admin" && <span className="rounded bg-destructive px-1.5 py-0.5 font-bold text-destructive-foreground">REMOVED BY ADMIN</span>}
                      {i.report_count > 0 && <span className="rounded bg-accent px-1.5 py-0.5 font-bold text-accent-foreground">{i.report_count} report(s)</span>}
                      {i.moderation_status !== "approved" && <span className="rounded bg-secondary px-1.5 py-0.5 font-bold">Under review</span>}
                    </div>
                    {i.caption && <p className="text-sm">{i.caption}</p>}
                    <p className="text-muted-foreground">Uploaded {fmt(i.created_at)}</p>
                    {i.deleted_at && <p className="text-muted-foreground">Deleted {fmt(i.deleted_at)} · was “{i.previous_visibility}” · kept until {fmt(i.retain_until)}</p>}
                    {i.deletion_reason && <p className="text-muted-foreground">Reason: {i.deletion_reason}</p>}
                    {!i.deleted_at && <p className="text-muted-foreground">Audience: {i.visibility}</p>}
                    <p className="font-mono text-[10px] text-muted-foreground">ID {i.id}</p>
                    <div className="flex gap-2 pt-1">
                      {i.deleted_by !== "admin" && <button onClick={() => run(i, "remove")} className="rounded-lg bg-destructive px-2 py-1 font-bold text-destructive-foreground">Remove</button>}
                      {i.deleted_at && <button onClick={() => run(i, "restore_private")} className="rounded-lg bg-muted px-2 py-1 font-bold">Restore (owner only)</button>}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
