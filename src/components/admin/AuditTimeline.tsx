import { UserLink } from "./UserLink";

const SEVERITY_COLORS: Record<string, string> = {
  info: "bg-muted text-muted-foreground",
  low: "bg-blue-500/10 text-blue-600",
  medium: "bg-amber-500/10 text-amber-600",
  high: "bg-orange-500/10 text-orange-600",
  critical: "bg-destructive/10 text-destructive",
};

type Row = {
  id: string;
  subject_user_id: string;
  actor_user_id: string | null;
  event_type: string;
  severity: string;
  summary: string;
  details: any;
  occurred_at: string;
  order_id: string | null;
  dispute_id: string | null;
};

export function AuditTimeline({
  rows,
  onOpenUser,
  showSubject = false,
}: {
  rows: Row[];
  onOpenUser?: (id: string) => void;
  showSubject?: boolean;
}) {
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground py-8 text-center">No audit events yet.</p>;
  }
  return (
    <ol className="space-y-2">
      {rows.map((r) => (
        <li key={r.id} className="border rounded-lg p-3 bg-card text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${SEVERITY_COLORS[r.severity] ?? ""}`}
            >
              {r.severity}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">{r.event_type}</span>
            <span className="text-[10px] text-muted-foreground ml-auto">
              {new Date(r.occurred_at).toLocaleString()}
            </span>
          </div>
          <p className="mt-1 font-medium">{r.summary}</p>
          <div className="mt-1 flex items-center gap-3 flex-wrap text-[10px] text-muted-foreground">
            {showSubject && (
              <span>
                subject: <UserLink userId={r.subject_user_id} onOpen={onOpenUser} />
              </span>
            )}
            {r.actor_user_id && (
              <span>
                by <UserLink userId={r.actor_user_id} onOpen={onOpenUser} />
              </span>
            )}
            {r.order_id && <span>order: {r.order_id.slice(0, 8)}</span>}
            {r.dispute_id && <span>dispute: {r.dispute_id.slice(0, 8)}</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}
