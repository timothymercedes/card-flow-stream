import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/admin/trades")({
  head: () => ({ meta: [{ title: "PB Trade Oversight — Admin" }, { name: "description", content: "Review PB Trades, tracking and issue reports." }] }),
  component: Page,
});

function Page() {
  const { user } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [trades, setTrades] = useState<any[]>([]);
  const [issues, setIssues] = useState<any[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [note, setNote] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"open" | "issues" | "all">("open");

  async function load() {
    const [{ data: t }, { data: i }] = await Promise.all([
      supabase.from("trades").select("id, from_user, to_user, status, created_at, from_carrier, from_tracking, from_shipped_at, to_carrier, to_tracking, to_shipped_at, from_received_at, to_received_at, trade_items(owner_side, card_name)").order("created_at", { ascending: false }).limit(200),
      supabase.from("trade_issues").select("id, trade_id, reporter_id, body, created_at, resolved_at, resolution_note").order("created_at", { ascending: false }).limit(200),
    ]);
    setTrades(t ?? []); setIssues(i ?? []);
    const ids = [...new Set((t ?? []).flatMap((x) => [x.from_user, x.to_user]))];
    if (ids.length) {
      const { data: p } = await supabase.from("profiles").select("id, username").in("id", ids);
      setNames(Object.fromEntries((p ?? []).map((x) => [x.id, x.username ? `@${x.username}` : "member"])));
    }
  }
  useEffect(() => {
    if (!user) return;
    void Promise.all([supabase.rpc("has_role", { _user_id: user.id, _role: "admin" }), supabase.rpc("has_role", { _user_id: user.id, _role: "owner" })])
      .then(([a, o]) => { const ok = !!(a.data || o.data); setAllowed(ok); if (ok) void load(); });
  }, [user?.id]);

  async function act(tradeId: string, action: "resolve_issue" | "cancel", issueId?: string) {
    if (action === "cancel" && !window.confirm("Cancel this trade and unlock both members' cards?")) return;
    const { error } = await supabase.rpc("trade_staff_action", { p_trade: tradeId, p_action: action, p_issue: issueId, p_note: issueId ? note[issueId] : undefined });
    if (error) toast.error(error.message); else { toast.success(action === "cancel" ? "Trade cancelled" : "Issue resolved"); void load(); }
  }

  if (allowed === false) return <AppShell><p className="p-6 text-sm">Admins only.</p></AppShell>;
  const openIssueTrades = new Set(issues.filter((i) => !i.resolved_at).map((i) => i.trade_id));
  const shown = trades.filter((t) => filter === "all" || (filter === "issues" ? openIssueTrades.has(t.id) : !["completed", "cancelled", "countered"].includes(t.status)));
  const side = (c?: string, n?: string, s?: string, r?: string) => s ? `${c} · ${n}${r ? " · received" : " · in transit"}` : "Not shipped";

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <Link to="/admin" className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground"><ArrowLeft className="h-3 w-3" /> Admin</Link>
        <h1 className="flex items-center gap-2 text-xl font-bold"><ArrowLeftRight className="h-5 w-5 text-primary" /> PB Trade oversight</h1>
        <div className="flex gap-2">{(["open", "issues", "all"] as const).map((f) => <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>{f === "open" ? "Open" : f === "issues" ? `Issues (${openIssueTrades.size})` : "All"}</Button>)}</div>
        {shown.length === 0 && <p className="text-sm text-muted-foreground">No trades here.</p>}
        {shown.map((t) => (
          <Card key={t.id} className="space-y-2 p-3 text-xs">
            <div className="flex items-center justify-between gap-2"><b>{names[t.from_user] ?? "member"} ⇄ {names[t.to_user] ?? "member"}</b><span className="rounded-full bg-muted px-2 py-0.5 font-bold capitalize">{t.status}</span></div>
            <p className="text-muted-foreground">{(t.trade_items ?? []).map((i: any) => `${i.owner_side === "from" ? "→" : "←"} ${i.card_name}`).join(" · ") || "Cash only"}</p>
            <p>Sender: {side(t.from_carrier, t.from_tracking, t.from_shipped_at, t.to_received_at)}</p>
            <p>Recipient: {side(t.to_carrier, t.to_tracking, t.to_shipped_at, t.from_received_at)}</p>
            {issues.filter((i) => i.trade_id === t.id).map((i) => (
              <div key={i.id} className="rounded-lg border border-border p-2">
                <p><b>Issue by {names[i.reporter_id] ?? "member"}:</b> {i.body}</p>
                {i.resolved_at ? <p className="mt-1 text-muted-foreground">Resolved{i.resolution_note ? ` — ${i.resolution_note}` : ""}</p> : (
                  <div className="mt-2 flex gap-2"><input aria-label="Resolution note" placeholder="Resolution note" value={note[i.id] ?? ""} onChange={(e) => setNote({ ...note, [i.id]: e.target.value })} className="h-8 flex-1 rounded-md border border-input bg-background px-2" /><Button size="sm" onClick={() => void act(t.id, "resolve_issue", i.id)}>Resolve</Button></div>
                )}
              </div>
            ))}
            {!["completed", "cancelled", "countered"].includes(t.status) && <Button size="sm" variant="outline" onClick={() => void act(t.id, "cancel")}>Cancel trade</Button>}
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
