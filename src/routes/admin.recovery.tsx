import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ShieldAlert, RefreshCw, RotateCcw, PlayCircle } from "lucide-react";

export const Route = createFileRoute("/admin/recovery")({
  head: () => ({ meta: [{ title: "Auction Recovery — Admin" }] }),
  component: AdminRecovery,
});

function AdminRecovery() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stuck, setStuck] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      const admin = (data || []).some((r: any) => r.role === "admin" || r.role === "owner");
      setIsAdmin(admin);
      setLoading(false);
      if (admin) await refresh();
    })();
  }, [user]);

  async function refresh() {
    const cutoff = new Date(Date.now() - 30_000).toISOString();
    const { data } = await supabase
      .from("live_streams")
      .select("id, title, seller_id, status, ends_at, winner_id, winner_username, current_bid, current_bidder_id, quick_start_remaining, round_number")
      .eq("status", "live")
      .lt("ends_at", cutoff)
      .limit(50);
    setStuck(data || []);
  }

  async function runSweep() {
    setBusy("sweep");
    const { data, error } = await (supabase.rpc as any)("sweep_stuck_auctions");
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(`Sweep: ${data?.finalized || 0} finalized, ${data?.rearmed || 0} rearmed`);
    await refresh();
  }

  async function replayFinalize(id: string) {
    setBusy(id);
    const { error } = await (supabase.rpc as any)("admin_replay_finalize", { _stream_id: id });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Finalize replayed");
    await refresh();
  }

  async function forceRearm(id: string) {
    setBusy(id);
    const { error } = await (supabase.rpc as any)("admin_force_rearm", { _stream_id: id });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Round rearmed");
    await refresh();
  }

  if (loading) return <AppShell><p className="p-6 text-center text-sm text-muted-foreground">Loading…</p></AppShell>;
  if (!isAdmin) return <AppShell><p className="p-6 text-center text-sm text-muted-foreground">Admins only.</p></AppShell>;

  return (
    <AppShell>
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-lg font-bold">
            <ShieldAlert className="h-5 w-5 text-amber-400" /> Auction Recovery
          </h1>
          <Link to="/admin" className="text-xs text-muted-foreground underline">← Back to admin</Link>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={runSweep}
            disabled={busy === "sweep"}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${busy === "sweep" ? "animate-spin" : ""}`} />
            Run sweep now
          </button>
          <button
            onClick={refresh}
            className="inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs font-semibold"
          >
            <RotateCcw className="h-4 w-4" /> Refresh
          </button>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Auto-sweep runs every minute via pg_cron and finalizes any live auction whose timer
          ended without being closed. The list below shows streams that look stuck right now.
        </p>

        <div className="space-y-2">
          {stuck.length === 0 && (
            <p className="rounded-lg bg-muted/30 p-4 text-center text-xs text-muted-foreground">
              ✓ No stuck auctions detected.
            </p>
          )}
          {stuck.map((s) => (
            <div key={s.id} className="rounded-xl bg-card p-3 text-xs">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{s.title || s.id}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Round #{s.round_number || 0} · ends_at {new Date(s.ends_at).toLocaleString()}
                  </p>
                  <p className="text-[11px]">
                    Top bid: ${Number(s.current_bid || 0).toFixed(2)} ·{" "}
                    Bidder: {s.current_bidder_id ? s.current_bidder_id.slice(0, 8) : "—"} ·{" "}
                    Winner locked: {s.winner_id ? "yes" : "no"} ·{" "}
                    Qty left: {s.quick_start_remaining ?? 0}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => replayFinalize(s.id)}
                    disabled={busy === s.id}
                    className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-bold text-primary-foreground disabled:opacity-60"
                  >
                    <PlayCircle className="h-3 w-3" /> Replay finalize
                  </button>
                  <button
                    onClick={() => forceRearm(s.id)}
                    disabled={busy === s.id}
                    className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] font-semibold disabled:opacity-60"
                  >
                    <RotateCcw className="h-3 w-3" /> Force rearm
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
