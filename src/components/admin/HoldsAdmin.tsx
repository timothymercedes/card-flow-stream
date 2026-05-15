import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ShieldOff, Check, AlertTriangle, Receipt, Shield, Lock } from "lucide-react";
import { adminOverrideTrustFn } from "@/lib/payouts.functions";

type Trust = {
  user_id: string;
  completed_deliveries: number;
  tier: string;
  instant_release_pct: number;
  manual_override_pct: number | null;
  frozen: boolean;
  dispute_rate_30d: number;
  chargeback_rate_30d: number;
  updated_at: string;
};

type Recovery = {
  id: string;
  user_id: string;
  source: string;
  reference_id: string | null;
  gross_cents: number;
  deducted_cents: number;
  net_released_cents: number;
  remaining_owed_cents: number;
  created_at: string;
};

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
  const [recoveries, setRecoveries] = useState<Recovery[]>([]);
  const [trusts, setTrusts] = useState<Trust[]>([]);
  const [view, setView] = useState<"active" | "all" | "recoveries" | "trust">("active");
  const [loading, setLoading] = useState(true);
  const overrideTrust = useServerFn(adminOverrideTrustFn);

  async function load() {
    setLoading(true);
    if (view === "recoveries") {
      const { data } = await supabase
        .from("hold_recoveries" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      setRecoveries((data as any) || []);
    } else if (view === "trust") {
      const { data } = await supabase
        .from("seller_trust" as any)
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(200);
      setTrusts((data as any) || []);
    } else {
      let q = supabase.from("account_holds" as any).select("*").order("opened_at", { ascending: false }).limit(200);
      if (view === "active") q = q.eq("status", "active");
      const { data } = await q;
      setHolds((data as any) || []);
    }
    setLoading(false);
  }

  async function setOverride(userId: string) {
    const raw = prompt("Instant payout %% (0-100, blank to clear override):");
    if (raw === null) return;
    const pct = raw.trim() === "" ? null : Math.max(0, Math.min(100, Number(raw)));
    if (pct !== null && Number.isNaN(pct)) return toast.error("Invalid number");
    const reason = prompt("Audit reason:") || "manual override";
    try {
      await overrideTrust({ data: { userId, instantPct: pct, reason } });
      toast.success("Override applied");
      load();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  }

  async function toggleFreeze(userId: string, freeze: boolean) {
    const reason = prompt(`${freeze ? "Freeze" : "Unfreeze"} reason:`) || (freeze ? "freeze" : "unfreeze");
    try {
      await overrideTrust({ data: { userId, instantPct: null, frozen: freeze, reason } });
      toast.success(freeze ? "Account frozen" : "Account unfrozen");
      load();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [view]);

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

  const tabBtn = (key: typeof view, label: string) => (
    <button
      onClick={() => setView(key)}
      className={`rounded-full px-3 py-1 text-xs font-bold ${view === key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {tabBtn("active", `Active (${holds.filter(h => h.status === "active").length})`)}
        {tabBtn("all", "All holds")}
        {tabBtn("recoveries", "Auto-recoveries")}
        {tabBtn("trust", "Trust & risk")}
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : view === "trust" ? (
        trusts.length === 0 ? (
          <p className="text-xs text-muted-foreground">No seller trust rows yet.</p>
        ) : (
          <div className="space-y-2">
            {trusts.map((t) => {
              const effectivePct = t.manual_override_pct ?? t.instant_release_pct;
              return (
                <div key={t.user_id} className="rounded-xl border border-border bg-card p-3 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {t.frozen ? <Lock className="h-3.5 w-3.5 text-destructive" /> : <Shield className="h-3.5 w-3.5 text-primary" />}
                        <code className="truncate text-[11px]">{t.user_id}</code>
                      </div>
                      <p className="mt-0.5 text-sm font-bold capitalize">
                        {t.tier} · {effectivePct}% instant
                        {t.manual_override_pct != null && <span className="ml-1 text-[10px] text-amber-500">(override)</span>}
                        {t.frozen && <span className="ml-1 text-[10px] text-destructive">(frozen)</span>}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {t.completed_deliveries} delivered · disputes {(t.dispute_rate_30d * 100).toFixed(1)}% · chargebacks {(t.chargeback_rate_30d * 100).toFixed(1)}%
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <button
                        onClick={() => setOverride(t.user_id)}
                        className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-1 text-[11px] font-bold text-amber-500 hover:bg-amber-500/25"
                      >
                        Set %
                      </button>
                      <button
                        onClick={() => toggleFreeze(t.user_id, !t.frozen)}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold ${t.frozen ? "bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25" : "bg-destructive/15 text-destructive hover:bg-destructive/25"}`}
                      >
                        {t.frozen ? "Unfreeze" : "Freeze"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : view === "recoveries" ? (
        recoveries.length === 0 ? (
          <p className="text-xs text-muted-foreground">No automatic deductions yet.</p>
        ) : (
          <div className="space-y-2">
            {recoveries.map((r) => (
              <div key={r.id} className="rounded-xl border border-border bg-card p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 font-bold capitalize">
                    <Receipt className="h-3 w-3" /> {r.source}
                  </span>
                  <span className="text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
                </div>
                <code className="mt-1 block truncate text-[10px] text-muted-foreground">user: {r.user_id}</code>
                <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] sm:grid-cols-4">
                  <div><span className="text-muted-foreground">Earned</span><div className="font-bold">${(r.gross_cents / 100).toFixed(2)}</div></div>
                  <div><span className="text-muted-foreground">Deducted</span><div className="font-bold text-destructive">−${(r.deducted_cents / 100).toFixed(2)}</div></div>
                  <div><span className="text-muted-foreground">Released</span><div className="font-bold text-emerald-500">${(r.net_released_cents / 100).toFixed(2)}</div></div>
                  <div><span className="text-muted-foreground">Still owed</span><div className="font-bold">${(r.remaining_owed_cents / 100).toFixed(2)}</div></div>
                </div>
                {r.reference_id ? <code className="mt-1 block truncate text-[10px] text-muted-foreground">ref: {r.reference_id}</code> : null}
              </div>
            ))}
          </div>
        )
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
