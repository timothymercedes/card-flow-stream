import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getGlobalAuditFn } from "@/lib/moderation.functions";
import { AuditTimeline } from "./AuditTimeline";
import { AdminUserDossier } from "./AdminUserDossier";

const SEVERITIES = ["", "info", "low", "medium", "high", "critical"] as const;

export function AdminAuditLog() {
  const [severity, setSeverity] = useState<string>("");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openUser, setOpenUser] = useState<string | null>(null);
  const fetchLog = useServerFn(getGlobalAuditFn);

  async function refresh() {
    setLoading(true);
    try {
      const r = await fetchLog({ data: { severity: severity || undefined, limit: 200 } });
      setRows(r.rows);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [severity]);

  return (
    <div className="space-y-3">
      <div className="flex gap-1 text-xs">
        {SEVERITIES.map((s) => (
          <button
            key={s}
            onClick={() => setSeverity(s)}
            className={`px-2 py-1 rounded ${severity === s ? "bg-primary text-primary-foreground" : "bg-muted"}`}
          >
            {s || "all"}
          </button>
        ))}
      </div>
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : (
        <AuditTimeline rows={rows} onOpenUser={setOpenUser} showSubject />
      )}
      {openUser && (
        <AdminUserDossier userId={openUser} onClose={() => setOpenUser(null)} onOpenUser={setOpenUser} />
      )}
    </div>
  );
}
