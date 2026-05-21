import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listReportsFn, updateReportStatusFn } from "@/lib/moderation.functions";
import { UserLink } from "./UserLink";
import { AdminUserDossier } from "./AdminUserDossier";

const STATUSES = ["open", "investigating", "resolved", "dismissed", "escalated"] as const;

export function AdminReportsQueue() {
  const [status, setStatus] = useState<(typeof STATUSES)[number] | "">("open");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openUser, setOpenUser] = useState<string | null>(null);
  const list = useServerFn(listReportsFn);
  const update = useServerFn(updateReportStatusFn);

  async function refresh() {
    setLoading(true);
    try {
      const r = await list({ data: { status: status || undefined, limit: 100 } });
      setRows(r.rows);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function act(id: string, newStatus: (typeof STATUSES)[number]) {
    const notes = prompt(`Notes for marking as ${newStatus}? (optional)`) ?? undefined;
    try {
      await update({ data: { reportId: id, status: newStatus, notes } });
      toast.success(`Report ${newStatus}`);
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1 text-xs">
        <button
          onClick={() => setStatus("")}
          className={`px-2 py-1 rounded ${status === "" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
        >
          All
        </button>
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-2 py-1 rounded ${status === s ? "bg-primary text-primary-foreground" : "bg-muted"}`}
          >
            {s}
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
                <span className="px-1.5 py-0.5 rounded bg-muted font-mono text-[10px]">
                  {r.subject_type}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 text-[10px]">
                  {r.status}
                </span>
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {new Date(r.created_at).toLocaleString()}
                </span>
              </div>
              <p className="font-medium">{r.category}</p>
              <p className="text-muted-foreground">{r.description}</p>
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <span>
                  Reporter: <UserLink userId={r.reporter_id} onOpen={setOpenUser} />
                </span>
                {r.subject_user_id && (
                  <span>
                    Subject: <UserLink userId={r.subject_user_id} onOpen={setOpenUser} />
                  </span>
                )}
                {r.resolution_notes && (
                  <span className="text-muted-foreground">· Notes: {r.resolution_notes}</span>
                )}
              </div>
              {r.status !== "resolved" && r.status !== "dismissed" && (
                <div className="flex gap-1 pt-1">
                  {(["investigating", "escalated", "resolved", "dismissed"] as const)
                    .filter((s) => s !== r.status)
                    .map((s) => (
                      <button
                        key={s}
                        onClick={() => act(r.id, s)}
                        className="px-2 py-0.5 border rounded hover:bg-muted text-[10px]"
                      >
                        {s}
                      </button>
                    ))}
                </div>
              )}
            </li>
          ))}
          {rows.length === 0 && <li className="text-xs text-muted-foreground">No reports.</li>}
        </ul>
      )}
      {openUser && (
        <AdminUserDossier userId={openUser} onClose={() => setOpenUser(null)} onOpenUser={setOpenUser} />
      )}
    </div>
  );
}
