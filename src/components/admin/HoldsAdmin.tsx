import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ShieldOff, Check, AlertTriangle } from "lucide-react";

type Hold = {
  id: string;
  user_id: string;
  status: string;
  balance_owed_cents: number;
  reason: string | null;
  source: string;
  opened_at: string;
  cleared_at: string | null;
  notes: string | null;
};

export function HoldsAdmin() {
  const [holds, setHolds] = useState<Hold[]>([]);
  const [filter, setFilter] = useState<"active" | "all">("active");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    let q = supabase.from("account_holds" as any).select("*").order("opened_at", { ascending: false }).limit(200);
    if (filter === "active") q = q.eq("status", "active");
    const { data } = await q;
    setHolds((data as any) || []);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  async function clearHold(id: string, override: boolean) {
    const note = override
      ? prompt("Override reason (visible to user):") || ""
      : prompt("Optional clearing note:") || "";
    const { error } = await (supabase.rpc as any)("clear_hold_admin", {
      _hold_id: id, _override: override, _notes: note,
    });
    if (error) return toast.error(error.message);
    toast.success(override ? "Hold overridden" : "Hold cleared");
    load();
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={() => setFilter("active")}
          className={`rounded-full px-3 py-1 text-xs font-bold ${filter === "active" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
        >
          Active ({holds.filter(h => h.status === "active").length})
        </button>
        <button
          onClick={() => setFilter("all")}
          className={`rounded-full px-3 py-1 text-xs font-bold ${filter === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
        >
          All
        </button>
      </div>
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : holds.length === 0 ? (
        <p className="text-xs text-muted-foreground">No holds.</p>
      ) : (
        <div className="space-y-2">
          {holds.map((h) => (
            <div key={h.id} className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className={`h-3.5 w-3.5 ${h.status === "active" ? "text-destructive" : "text-muted-foreground"}`} />
                    <code className="truncate text-[11px]">{h.user_id}</code>
                  </div>
                  <p className="mt-0.5 text-sm font-bold">${(h.balance_owed_cents / 100).toFixed(2)} owed</p>
                  <p className="text-[11px] text-muted-foreground">
                    {h.source} · opened {new Date(h.opened_at).toLocaleString()} · status: <strong>{h.status}</strong>
                  </p>
                  {h.reason && <p className="mt-1 text-xs">{h.reason}</p>}
                  {h.notes && <p className="mt-1 whitespace-pre-line text-[11px] text-muted-foreground">{h.notes}</p>}
                </div>
                {h.status === "active" && (
                  <div className="flex shrink-0 flex-col gap-1">
                    <button
                      onClick={() => clearHold(h.id, false)}
                      className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-1 text-[11px] font-bold text-emerald-500 hover:bg-emerald-500/25"
                    >
                      <Check className="h-3 w-3" /> Clear (paid)
                    </button>
                    <button
                      onClick={() => clearHold(h.id, true)}
                      className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-1 text-[11px] font-bold text-amber-500 hover:bg-amber-500/25"
                    >
                      <ShieldOff className="h-3 w-3" /> Admin override
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
