import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAuditLogs } from "@/lib/audit.functions";

interface AuditRow {
  id: string;
  created_at: string;
  actor_id: string | null;
  actor_username?: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  meta: Record<string, unknown> | null;
}

export function AuditLogsAdmin() {
  const [filter, setFilter] = useState("");
  const fetchLogs = useServerFn(listAuditLogs);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["audit-logs", filter],
    queryFn: () => fetchLogs({ data: { limit: 100, action: filter || undefined } }),
  });

  const rows = ((data?.rows ?? []) as unknown) as AuditRow[];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by action (e.g. user.ban)"
          className="flex-1 rounded-xl bg-input px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          onClick={() => refetch()}
          className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"
        >
          {isFetching ? "…" : "Refresh"}
        </button>
      </div>

      {data?.error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {data.error}
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading audit logs…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No audit events yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card/40">
          {rows.map((r) => (
            <li key={r.id} className="p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-semibold text-primary">{r.action}</span>
                <time className="text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()}
                </time>
              </div>
              <div className="mt-1 text-muted-foreground">
                {r.target_type && <>target: <span className="font-mono">{r.target_type}/{r.target_id}</span> · </>}
                {r.actor_id && <>actor: <span className="font-mono">{r.actor_id.slice(0, 8)}…</span></>}
              </div>
              {r.meta && Object.keys(r.meta).length > 0 && (
                <pre className="mt-2 overflow-x-auto rounded bg-muted/40 p-2 font-mono text-[10px]">
                  {JSON.stringify(r.meta, null, 2)}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
