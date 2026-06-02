import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Bell, Smartphone, Globe, ArrowLeft, RefreshCcw, AlertTriangle } from "lucide-react";
import { listPushSubscriptions } from "@/lib/push.functions";

export const Route = createFileRoute("/admin/push-subscriptions")({
  head: () => ({ meta: [{ title: "Push Subscriptions — Admin" }] }),
  component: Page,
});
type Sub = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
  created_at: string;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_status: string | null;
  last_error: string | null;
  failure_count: number;
};

function detectPlatform(endpoint: string): "ios" | "android" | "web" {
  if (endpoint.startsWith("ios://")) return "ios";
  if (endpoint.startsWith("android://")) return "android";
  return "web";
}

function Page() {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Sub[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "ios" | "android" | "web" | "failed">("all");

  const fetchSubs = useServerFn(listPushSubscriptions);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    supabase.from("user_roles").select("role").eq("user_id", user.id)
      .then(({ data }) => {
        const roles = ((data ?? []) as any[]).map((r) => r.role);
        setIsAdmin(roles.includes("admin") || roles.includes("owner"));
      });
  }, [user, authLoading]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetchSubs();
      if (res.ok) setRows(res.rows);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  const stats = useMemo(() => {
    const ios = rows.filter((r) => detectPlatform(r.endpoint) === "ios");
    const android = rows.filter((r) => detectPlatform(r.endpoint) === "android");
    const web = rows.filter((r) => detectPlatform(r.endpoint) === "web");
    const failed = rows.filter((r) => r.last_status === "failed");
    return { ios, android, web, failed };
  }, [rows]);

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    if (filter === "failed") return rows.filter((r) => r.last_status === "failed");
    return rows.filter((r) => detectPlatform(r.endpoint) === filter);
  }, [rows, filter]);


  if (authLoading || isAdmin === null) {
    return (
      <AppShell>
        <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
      </AppShell>
    );
  }

  if (!isAdmin) {
    return (
      <AppShell>
        <div className="p-8 text-center">
          <h1 className="text-xl font-bold">Admin only</h1>
          <p className="mt-2 text-sm text-muted-foreground">You need admin access to view push subscriptions.</p>
          <Link to="/admin" className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Back to Admin</Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link to="/admin" className="rounded-md p-1.5 hover:bg-muted" aria-label="Back">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <Bell className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-extrabold sm:text-xl">Push Subscriptions</h1>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1 rounded-full bg-muted px-3 py-1.5 text-xs font-bold hover:bg-muted/70 disabled:opacity-50"
          >
            <RefreshCcw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatCard
            icon={<Smartphone className="h-4 w-4 text-blue-400" />}
            label="iOS"
            count={stats.ios.length}
            active={filter === "ios"}
            onClick={() => setFilter(filter === "ios" ? "all" : "ios")}
          />
          <StatCard
            icon={<Smartphone className="h-4 w-4 text-emerald-400" />}
            label="Android"
            count={stats.android.length}
            active={filter === "android"}
            onClick={() => setFilter(filter === "android" ? "all" : "android")}
          />
          <StatCard
            icon={<Globe className="h-4 w-4 text-amber-400" />}
            label="Web"
            count={stats.web.length}
            active={filter === "web"}
            onClick={() => setFilter(filter === "web" ? "all" : "web")}
          />
          <StatCard
            icon={<AlertTriangle className="h-4 w-4 text-red-400" />}
            label="Failed"
            count={stats.failed.length}
            active={filter === "failed"}
            onClick={() => setFilter(filter === "failed" ? "all" : "failed")}
          />
          <StatCard
            icon={<Bell className="h-4 w-4 text-primary" />}
            label="Total"
            count={rows.length}
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
        </div>

        {/* Filter pills */}
        <div className="flex flex-wrap gap-2">
          {(["all", "ios", "android", "web", "failed"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {f === "all" ? "All" : f === "ios" ? "iOS" : f === "android" ? "Android" : f === "web" ? "Web" : "Failed"}
              {f !== "all" && (
                <span className="ml-1.5 opacity-80">
                  {f === "ios" ? stats.ios.length : f === "android" ? stats.android.length : f === "web" ? stats.web.length : stats.failed.length}
                </span>
              )}
            </button>
          ))}
        </div>


        {/* Table */}
        <Card className="overflow-hidden">
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card text-xs font-bold text-muted-foreground uppercase border-b border-border">
                <tr>
                  <th className="text-left p-3">Platform</th>
                  <th className="text-left p-3">User</th>
                  <th className="text-left p-3">Endpoint</th>
                  <th className="text-left p-3">Delivery</th>
                  <th className="text-left p-3">Last attempt</th>
                  <th className="text-left p-3">Error reason</th>
                  <th className="text-left p-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((sub) => {
                  const platform = detectPlatform(sub.endpoint);
                  return (
                    <tr key={sub.id} className="border-b border-border/40 hover:bg-muted/30 transition">
                      <td className="p-3">
                        <PlatformBadge platform={platform} />
                      </td>
                      <td className="p-3 font-mono text-xs text-muted-foreground">
                        {String(sub.user_id).slice(0, 8)}…
                      </td>
                      <td className="p-3 font-mono text-xs text-muted-foreground max-w-xs truncate" title={sub.endpoint}>
                        {sub.endpoint}
                      </td>
                      <td className="p-3">
                        <DeliveryBadge status={sub.last_status} failureCount={sub.failure_count} />
                      </td>
                      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                        {sub.last_attempt_at ? new Date(sub.last_attempt_at).toLocaleString() : "—"}
                      </td>
                      <td className="p-3 text-xs max-w-xs">
                        {sub.last_status === "failed" && sub.last_error ? (
                          <span className="text-red-400 line-clamp-2 break-words" title={sub.last_error}>
                            {sub.last_error}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(sub.created_at).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-sm text-muted-foreground">
                      {loading ? "Loading…" : "No subscriptions found."}
                    </td>
                  </tr>
                )}

              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

function StatCard({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border p-3 text-left transition ${
        active
          ? "border-primary bg-primary/10 ring-1 ring-primary/30"
          : "border-border bg-card hover:bg-muted/50"
      }`}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-1 text-2xl font-extrabold tabular-nums">{count}</div>
    </button>
  );
}

function PlatformBadge({ platform }: { platform: "ios" | "android" | "web" }) {
  const variants: Record<typeof platform, { label: string; className: string }> = {
    ios: { label: "iOS", className: "bg-blue-500/15 text-blue-500 ring-1 ring-blue-500/30" },
    android: { label: "Android", className: "bg-emerald-500/15 text-emerald-500 ring-1 ring-emerald-500/30" },
    web: { label: "Web", className: "bg-amber-500/15 text-amber-500 ring-1 ring-amber-500/30" },
  };
  const v = variants[platform];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${v.className}`}>
      {v.label}
    </span>
  );
}

function DeliveryBadge({ status, failureCount }: { status: string | null; failureCount: number }) {
  if (!status) {
    return <span className="text-xs text-muted-foreground">Not attempted</span>;
  }
  if (status === "success") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-500 ring-1 ring-emerald-500/30">
        Delivered
      </span>
    );
  }
  // failed
  const willRetry = failureCount < 5;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="inline-flex w-fit items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-500 ring-1 ring-red-500/30">
        Failed{failureCount > 0 ? ` ×${failureCount}` : ""}
      </span>
      <span className={`text-[10px] font-semibold ${willRetry ? "text-amber-500" : "text-muted-foreground"}`}>
        {willRetry ? "Will retry next send" : "Retries exhausted"}
      </span>
    </div>
  );
}

