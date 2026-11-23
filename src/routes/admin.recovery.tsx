import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ShieldAlert, RefreshCw, RotateCcw, PlayCircle } from "lucide-react";
import { useServerFn } from '@tanstack/react-start';
import { endLiveSession, listActiveFlexSessions } from '@/lib/liveTermination.functions';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute("/admin/recovery")({
  head: () => ({ meta: [{ title: 'Live Recovery — PullBid Live Admin' }, { name: 'description', content: 'Review stuck auctions and close Flex broadcasts with an audit reason.' }, { property: 'og:title', content: 'Live Recovery — PullBid Live Admin' }, { property: 'og:description', content: 'Administrative live-session recovery.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }, { name: 'robots', content: 'noindex,nofollow' }] }),
  component: AdminRecovery,
});

function AdminRecovery() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stuck, setStuck] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [flex, setFlex] = useState<{ id: string; title: string | null; status: string | null; seller_id: string }[]>([]);
  const listFlex = useServerFn(listActiveFlexSessions);
  const terminate = useServerFn(endLiveSession);

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
    try { setFlex(await listFlex()); } catch { toast.error('Could not load Flex sessions.'); }
  }
  async function endFlex(id: string) {
    const reason = window.prompt('Reason for ending this Flex stream?');
    if (!reason || reason.trim().length < 3) return;
    setBusy(id);
    try { await terminate({ data: { streamId: id, reason: reason.trim() } }); toast.success('Flex stream ended'); await refresh(); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Could not end stream.'); }
    finally { setBusy(null); }
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
          <h2 className="font-semibold">Active Flex sessions</h2>
          {flex.length === 0 && <p className="text-sm text-muted-foreground">No active Flex sessions.</p>}
          {flex.map(session => <div key={session.id} className="flex items-center justify-between gap-3 border-b border-border py-3"><div className="min-w-0"><p className="break-words font-semibold">{session.title || 'Flex stream'}</p><p className="text-xs text-muted-foreground">{session.status}</p></div><Button variant="destructive" disabled={busy === session.id} onClick={() => void endFlex(session.id)}>End Flex</Button></div>)}
          <h2 className="pt-4 font-semibold">Stuck auctions</h2>
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
