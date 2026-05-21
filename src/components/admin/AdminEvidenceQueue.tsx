import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listEvidenceFn, reviewEvidenceFn } from "@/lib/moderation.functions";
import { UserLink } from "./UserLink";

const STATUSES = ["pending", "approved", "rejected", "flagged", "locked"] as const;

export function AdminEvidenceQueue() {
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("pending");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const list = useServerFn(listEvidenceFn);
  const review = useServerFn(reviewEvidenceFn);

  async function refresh() {
    setLoading(true);
    try {
      const r = await list({ data: { status, limit: 100 } });
      setRows(r.rows);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function act(id: string, to: "approved" | "rejected" | "flagged" | "locked") {
    const notes = prompt(`Notes for ${to}?`) ?? undefined;
    try {
      await review({ data: { evidenceId: id, status: to, notes } });
      toast.success(`Evidence ${to}`);
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1 text-xs">
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
        <ul className="grid sm:grid-cols-2 gap-2">
          {rows.map((r) => (
            <li key={r.id} className="border rounded-lg p-2 text-xs bg-card">
              {r.file_url && r.mime_type?.startsWith("image/") ? (
                <img src={r.file_url} alt="" className="w-full h-32 object-cover rounded" />
              ) : (
                <div className="h-32 bg-muted rounded flex items-center justify-center text-muted-foreground">
                  {r.mime_type ?? "file"}
                </div>
              )}
              <div className="mt-2 space-y-1">
                {r.caption && <p className="font-medium">{r.caption}</p>}
                <div className="text-[10px] text-muted-foreground">
                  <UserLink userId={r.uploaded_by} /> ·{" "}
                  {new Date(r.created_at).toLocaleString()}
                </div>
                {r.dispute_id && (
                  <div className="text-[10px]">Dispute: {r.dispute_id.slice(0, 8)}</div>
                )}
                {r.report_id && (
                  <div className="text-[10px]">Report: {r.report_id.slice(0, 8)}</div>
                )}
                {r.review_notes && (
                  <p className="text-[10px] text-muted-foreground italic">{r.review_notes}</p>
                )}
                <div className="flex gap-1 pt-1 flex-wrap">
                  {!r.locked &&
                    (["approved", "rejected", "flagged", "locked"] as const).map((a) => (
                      <button
                        key={a}
                        onClick={() => act(r.id, a)}
                        className="px-2 py-0.5 border rounded hover:bg-muted text-[10px]"
                      >
                        {a}
                      </button>
                    ))}
                  {r.locked && <span className="text-[10px] text-muted-foreground">🔒 locked</span>}
                </div>
              </div>
            </li>
          ))}
          {rows.length === 0 && (
            <li className="text-xs text-muted-foreground col-span-2">No evidence.</li>
          )}
        </ul>
      )}
    </div>
  );
}
