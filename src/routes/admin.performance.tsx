import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Activity, AlertTriangle, Gauge, RefreshCw, ShieldCheck, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/performance")({
  head: () => ({ meta: [{ title: "Performance — Admin" }] }),
  component: AdminPerformance,
});

type SummaryRow = {
  kind: string; request_count: number; error_count: number;
  p50_ms: number; p95_ms: number; p99_ms: number; max_ms: number; avg_ms: number;
};
type SlowRouteRow = { route: string; kind: string; hits: number; p95_ms: number; max_ms: number; avg_ms: number };
type ErrorRow = { id: number; created_at: string; severity: string; source: string; route: string | null; message: string };
type AlertEvent = { id: number; created_at: string; alert_name: string; kind: string; measured_value: number | null; threshold: number | null };
type Alert = { id: string; name: string; kind: string; enabled: boolean; threshold_ms: number | null; threshold_count: number | null; threshold_pct: number | null; window_minutes: number; notes: string | null };

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return Math.round(Number(n)).toLocaleString();
}

function AdminPerformance() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [windowMin, setWindowMin] = useState(60);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [slow, setSlow] = useState<SlowRouteRow[]>([]);
  const [errors, setErrors] = useState<ErrorRow[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase.from("user_roles").select("role").eq("user_id", user.id).then(({ data }) => {
      const roles = (data ?? []).map((r: any) => r.role);
      setIsAdmin(roles.includes("admin") || roles.includes("owner"));
    });
  }, [user]);

  async function loadAll() {
    setLoading(true);
    try {
      const [s, r, e, ev, al] = await Promise.all([
        supabase.rpc("perf_summary", { _minutes: windowMin }),
        supabase.rpc("perf_slow_routes", { _minutes: windowMin, _limit: 20 }),
        supabase.from("error_logs").select("id,created_at,severity,source,route,message").order("created_at", { ascending: false }).limit(50),
        supabase.from("perf_alert_events").select("id,created_at,alert_name,kind,measured_value,threshold").order("created_at", { ascending: false }).limit(20),
        supabase.from("perf_alerts").select("*").order("created_at", { ascending: true }),
      ]);
      setSummary((s.data as SummaryRow[]) ?? []);
      setSlow((r.data as SlowRouteRow[]) ?? []);
      setErrors((e.data as ErrorRow[]) ?? []);
      setEvents((ev.data as AlertEvent[]) ?? []);
      setAlerts((al.data as Alert[]) ?? []);
    } finally { setLoading(false); }
  }

  useEffect(() => { if (isAdmin) loadAll(); }, [isAdmin, windowMin]);
  useEffect(() => {
    if (!autoRefresh || !isAdmin) return;
    const t = setInterval(loadAll, 15000);
    return () => clearInterval(t);
  }, [autoRefresh, isAdmin, windowMin]);

  const totals = useMemo(() => {
    const requests = summary.reduce((a, s) => a + Number(s.request_count || 0), 0);
    const errs = summary.reduce((a, s) => a + Number(s.error_count || 0), 0);
    const p95 = Math.max(0, ...summary.map((s) => Number(s.p95_ms || 0)));
    const errRate = requests ? (errs / requests) * 100 : 0;
    return { requests, errs, p95, errRate };
  }, [summary]);

  async function toggleAlert(a: Alert) {
    const { error } = await supabase.from("perf_alerts").update({ enabled: !a.enabled }).eq("id", a.id);
    if (error) toast.error(error.message); else loadAll();
  }
  async function purge() {
    if (!confirm("Purge metrics older than 7 days and errors older than 30 days?")) return;
    const { error } = await supabase.rpc("purge_old_perf_data");
    if (error) toast.error(error.message); else { toast.success("Purged"); loadAll(); }
  }

  if (!user) return <AppShell><div className="p-8 text-center text-sm">Sign in.</div></AppShell>;
  if (isAdmin === null) return <AppShell><div className="p-8 text-center text-sm text-muted-foreground">Loading…</div></AppShell>;
  if (!isAdmin) return (
    <AppShell><div className="p-8 text-center">
      <p className="text-sm text-muted-foreground">Admin access required.</p>
      <Link to="/" className="mt-4 inline-block text-xs text-primary">Go home</Link>
    </div></AppShell>
  );

  return (
    <AppShell>
      <div className="px-4 py-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Gauge className="h-6 w-6" /> Performance</h1>
          <Link to="/admin" className="text-xs text-muted-foreground underline">← Admin home</Link>
          <div className="ml-auto flex items-center gap-2">
            <select value={windowMin} onChange={(e) => setWindowMin(Number(e.target.value))} className="rounded-md bg-card px-2 py-1 text-xs">
              <option value={5}>Last 5 min</option>
              <option value={15}>Last 15 min</option>
              <option value={60}>Last 1 hour</option>
              <option value={360}>Last 6 hours</option>
              <option value={1440}>Last 24 hours</option>
            </select>
            <button onClick={() => setAutoRefresh((v) => !v)} className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold ${autoRefresh ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> {autoRefresh ? "Auto" : "Manual"}
            </button>
            <button onClick={loadAll} className="rounded-md bg-card px-2 py-1 text-xs">Refresh</button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Kpi label="Requests" value={fmt(totals.requests)} icon={<Activity className="h-4 w-4" />} />
          <Kpi label="Errors" value={fmt(totals.errs)} accent={totals.errs > 0 ? "destructive" : undefined} icon={<AlertTriangle className="h-4 w-4" />} />
          <Kpi label="Error rate" value={`${totals.errRate.toFixed(2)}%`} accent={totals.errRate > 5 ? "destructive" : totals.errRate > 1 ? "warning" : undefined} icon={<ShieldCheck className="h-4 w-4" />} />
          <Kpi label="Worst p95" value={`${fmt(totals.p95)} ms`} accent={totals.p95 > 3000 ? "destructive" : totals.p95 > 1000 ? "warning" : undefined} icon={<Zap className="h-4 w-4" />} />
        </div>

        {/* Summary by kind */}
        <Card title="By workload kind">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase text-muted-foreground">
                <tr><th className="text-left py-1">Kind</th><th>Hits</th><th>Errors</th><th>p50</th><th>p95</th><th>p99</th><th>Max</th></tr>
              </thead>
              <tbody>
                {summary.length === 0 && <tr><td colSpan={7} className="py-4 text-center text-muted-foreground">No data in window.</td></tr>}
                {summary.map((s) => (
                  <tr key={s.kind} className="border-t border-border">
                    <td className="py-1 font-bold">{s.kind}</td>
                    <td className="text-center">{fmt(s.request_count)}</td>
                    <td className={`text-center ${Number(s.error_count) > 0 ? "text-destructive font-bold" : ""}`}>{fmt(s.error_count)}</td>
                    <td className="text-center">{fmt(s.p50_ms)}</td>
                    <td className={`text-center ${Number(s.p95_ms) > 1000 ? "text-yellow-500 font-bold" : ""}`}>{fmt(s.p95_ms)}</td>
                    <td className="text-center">{fmt(s.p99_ms)}</td>
                    <td className="text-center">{fmt(s.max_ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Slow routes */}
        <Card title="Slowest routes (p95)">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase text-muted-foreground">
                <tr><th className="text-left py-1">Route</th><th>Kind</th><th>Hits</th><th>p95</th><th>Max</th></tr>
              </thead>
              <tbody>
                {slow.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">No data.</td></tr>}
                {slow.map((s) => (
                  <tr key={`${s.route}-${s.kind}`} className="border-t border-border">
                    <td className="py-1 truncate max-w-[260px]" title={s.route}>{s.route}</td>
                    <td className="text-center">{s.kind}</td>
                    <td className="text-center">{fmt(s.hits)}</td>
                    <td className={`text-center ${Number(s.p95_ms) > 1000 ? "text-yellow-500 font-bold" : ""}`}>{fmt(s.p95_ms)}</td>
                    <td className="text-center">{fmt(s.max_ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Alerts config */}
        <Card title="Alert thresholds">
          <div className="space-y-2">
            {alerts.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/30 p-2 text-xs">
                <button onClick={() => toggleAlert(a)} className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${a.enabled ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{a.enabled ? "ON" : "OFF"}</button>
                <span className="font-bold">{a.name}</span>
                <span className="text-muted-foreground">[{a.kind}]</span>
                <span className="text-muted-foreground">
                  {a.threshold_ms != null && `> ${a.threshold_ms} ms `}
                  {a.threshold_count != null && `> ${a.threshold_count} `}
                  {a.threshold_pct != null && `> ${a.threshold_pct}% `}
                  in {a.window_minutes}m
                </span>
                {a.notes && <span className="ml-auto text-[10px] text-muted-foreground italic">{a.notes}</span>}
              </div>
            ))}
            {alerts.length === 0 && <p className="text-xs text-muted-foreground">No alerts configured.</p>}
          </div>
        </Card>

        {/* Recent alert events */}
        <Card title="Recent alert events">
          {events.length === 0 ? (
            <p className="text-xs text-muted-foreground">No alerts triggered.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {events.map((e) => (
                <li key={e.id} className="flex items-center gap-2 rounded bg-destructive/10 p-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                  <span className="font-bold">{e.alert_name}</span>
                  <span className="text-muted-foreground">{e.kind}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Recent errors */}
        <Card title="Recent errors (latest 50)">
          <div className="space-y-1">
            {errors.length === 0 && <p className="text-xs text-muted-foreground">No errors recorded.</p>}
            {errors.map((e) => (
              <div key={e.id} className="rounded bg-card p-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${e.severity === "critical" ? "bg-destructive text-destructive-foreground" : e.severity === "error" ? "bg-destructive/20 text-destructive" : e.severity === "warning" ? "bg-yellow-500/20 text-yellow-500" : "bg-muted text-muted-foreground"}`}>{e.severity}</span>
                  <span className="text-muted-foreground">{e.source}</span>
                  {e.route && <span className="truncate text-muted-foreground">{e.route}</span>}
                  <span className="ml-auto text-[10px] text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
                </div>
                <p className="mt-1 truncate font-mono">{e.message}</p>
              </div>
            ))}
          </div>
        </Card>

        <div className="flex justify-end">
          <button onClick={purge} className="inline-flex items-center gap-1 rounded-md bg-muted px-3 py-1.5 text-xs">
            <Trash2 className="h-3 w-3" /> Purge old data
          </button>
        </div>

        <p className="text-[10px] text-muted-foreground">
          Phase B (load testing): k6 scripts and capacity report to be generated in the next iteration.
          Real 1k-user simulations must run from external machines (k6 Cloud or Grafana k6) — running them from the app would skew results.
        </p>
      </div>
    </AppShell>
  );
}

function Kpi({ label, value, icon, accent }: { label: string; value: string; icon: React.ReactNode; accent?: "destructive" | "warning" }) {
  const cls = accent === "destructive" ? "text-destructive" : accent === "warning" ? "text-yellow-500" : "";
  return (
    <div className="rounded-lg bg-card p-3">
      <div className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground">{icon}{label}</div>
      <p className={`text-xl font-bold ${cls}`}>{value}</p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-card p-3">
      <h2 className="mb-2 text-sm font-bold">{title}</h2>
      {children}
    </section>
  );
}
