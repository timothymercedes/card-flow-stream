import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listDisputesFn,
  updateDisputeLifecycleFn,
  runReconciliationCheckFn,
} from "@/lib/moderation.functions";
import { UserLink } from "./UserLink";
import { AdminUserDossier } from "./AdminUserDossier";

const LIFECYCLES = [
  "opened",
  "evidence_pending",
  "under_review",
  "escalated",
  "resolved_refund",
  "resolved_rebook",
  "resolved_partial",
  "rejected",
  "closed",
] as const;

export function AdminDisputesQueue() {
  const [lifecycle, setLifecycle] = useState<string>("");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openUser, setOpenUser] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState<string | null>(null);
  const [reconResult, setReconResult] = useState<any>(null);
  const list = useServerFn(listDisputesFn);
  const update = useServerFn(updateDisputeLifecycleFn);
  const recon = useServerFn(runReconciliationCheckFn);

  async function refresh() {
    setLoading(true);
    try {
      const r = await list({ data: { lifecycle: lifecycle || undefined, limit: 100 } });
      setRows(r.rows);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lifecycle]);

  async function transition(id: string, to: (typeof LIFECYCLES)[number]) {
    const notes = prompt(`Notes for ${to}? (optional)`) ?? undefined;
    try {
      await update({ data: { disputeId: id, lifecycle: to, notes } });
      toast.success(`Dispute → ${to}`);
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    }
  }

  async function runRecon(id: string) {
    setReconciling(id);
    try {
      const r = await recon({ data: { disputeId: id } });
      setReconResult(r);
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setReconciling(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1 text-xs flex-wrap">
        <button
          onClick={() => setLifecycle("")}
          className={`px-2 py-1 rounded ${lifecycle === "" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
        >
          All
        </button>
        {LIFECYCLES.map((s) => (
          <button
            key={s}
            onClick={() => setLifecycle(s)}
            className={`px-2 py-1 rounded ${lifecycle === s ? "bg-primary text-primary-foreground" : "bg-muted"}`}
          >
            {s.replace(/_/g, " ")}
          </button>
        ))}
      </div>
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="border rounded-lg p-3 text-xs space-y-1 bg-card">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-700 text-[10px]">
                  {r.lifecycle_status}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-muted text-[10px]">{r.status}</span>
                {r.amount_cents && (
                  <span className="text-[10px]">${(r.amount_cents / 100).toFixed(2)}</span>
                )}
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {new Date(r.created_at).toLocaleString()}
                </span>
              </div>
              <p className="font-medium">{r.reason}</p>
              <p className="text-muted-foreground line-clamp-2">{r.description}</p>
              <div className="flex items-center gap-3 flex-wrap pt-1">
                <span>
                  Reporter: <UserLink userId={r.reporter_id} onOpen={setOpenUser} />
                </span>
                {r.reported_user_id && (
                  <span>
                    Against: <UserLink userId={r.reported_user_id} onOpen={setOpenUser} />
                  </span>
                )}
                {r.order_id && <span>Order: {r.order_id.slice(0, 8)}</span>}
                {r.rebook_order_id && (
                  <span className="text-green-700">Rebook: {r.rebook_order_id.slice(0, 8)}</span>
                )}
              </div>
              <div className="flex gap-1 pt-1 flex-wrap">
                <button
                  onClick={() => runRecon(r.id)}
                  disabled={reconciling === r.id}
                  className="px-2 py-0.5 border rounded hover:bg-muted text-[10px]"
                >
                  {reconciling === r.id ? "…" : "Reconcile"}
                </button>
                {(["under_review", "escalated", "resolved_refund", "resolved_rebook", "rejected"] as const)
                  .filter((s) => s !== r.lifecycle_status)
                  .map((s) => (
                    <button
                      key={s}
                      onClick={() => transition(r.id, s)}
                      className="px-2 py-0.5 border rounded hover:bg-muted text-[10px]"
                    >
                      {s.replace(/_/g, " ")}
                    </button>
                  ))}
              </div>
            </li>
          ))}
          {rows.length === 0 && <li className="text-xs text-muted-foreground">No disputes.</li>}
        </ul>
      )}
      {reconResult && (
        <div
          onClick={() => setReconResult(null)}
          className="fixed inset-0 bg-background/80 z-50 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-card border rounded-lg p-4 max-w-md w-full"
          >
            <h3 className="font-bold text-sm">Reconciliation check</h3>
            <ul className="mt-2 space-y-1 text-xs">
              {reconResult.checks.map((c: any, i: number) => (
                <li key={i} className="flex items-center gap-2">
                  <span>{c.ok ? "✅" : "❌"}</span>
                  <span className="font-medium">{c.label}</span>
                  {c.detail && <span className="text-muted-foreground">— {c.detail}</span>}
                </li>
              ))}
            </ul>
            <button
              onClick={() => setReconResult(null)}
              className="mt-3 w-full py-1.5 bg-primary text-primary-foreground rounded text-xs"
            >
              Close
            </button>
          </div>
        </div>
      )}
      {openUser && (
        <AdminUserDossier userId={openUser} onClose={() => setOpenUser(null)} onOpenUser={setOpenUser} />
      )}
    </div>
  );
}
