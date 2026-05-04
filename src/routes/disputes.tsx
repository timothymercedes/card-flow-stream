import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ShieldAlert, Plus } from "lucide-react";

export const Route = createFileRoute("/disputes")({
  head: () => ({ meta: [{ title: "Disputes — PullBid Live" }] }),
  component: Disputes,
});

const REASONS = [
  { v: "not_received", l: "Item not received" },
  { v: "not_as_described", l: "Item not as described" },
  { v: "fake", l: "Counterfeit / fake" },
  { v: "fraud", l: "Fraud / scam" },
  { v: "other", l: "Other" },
];

function Disputes() {
  const { user, profile } = useAuth();
  const [list, setList] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ order_id: "", reason: "not_received", description: "" });

  async function load() {
    if (!user) return;
    const { data } = await supabase.from("disputes").select("*")
      .or(`reporter_id.eq.${user.id},reported_user_id.eq.${user.id}`)
      .order("created_at", { ascending: false });
    setList(data || []);
  }
  useEffect(() => { load(); }, [user]);

  async function file() {
    if (!user || !profile) return;
    if (!form.description || form.description.length < 10) return toast.error("Describe the issue in detail (10+ chars)");
    let reportedUserId: string | null = null;
    if (form.order_id) {
      const { data: o } = await supabase.from("orders").select("seller_id").eq("id", form.order_id).maybeSingle();
      reportedUserId = o?.seller_id || null;
    }
    const { error } = await supabase.from("disputes").insert({
      reporter_id: user.id,
      reporter_username: profile.username,
      reported_user_id: reportedUserId,
      order_id: form.order_id || null,
      reason: form.reason,
      description: form.description,
      status: "open",
    });
    if (error) return toast.error(error.message);
    toast.success("Dispute filed — admins will review");
    setCreating(false);
    setForm({ order_id: "", reason: "not_received", description: "" });
    load();
  }

  if (!user) return (
    <AppShell><div className="px-6 py-16 text-center">
      <p className="text-sm text-muted-foreground">Sign in to view disputes.</p>
      <Link to="/auth" className="mt-4 inline-block rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">Sign In</Link>
    </div></AppShell>
  );

  return (
    <AppShell>
      <div className="px-4 py-4 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-2xl font-bold"><ShieldAlert className="h-6 w-6" /> Disputes</h1>
          <button onClick={() => setCreating((v) => !v)} className="flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">
            <Plus className="h-3.5 w-3.5" /> File
          </button>
        </div>

        {creating && (
          <div className="rounded-xl bg-card p-4 space-y-2">
            <p className="text-sm font-bold">New dispute</p>
            <input value={form.order_id} onChange={(e) => setForm({ ...form, order_id: e.target.value })} placeholder="Order ID (optional)" className="w-full rounded-lg bg-input px-3 py-2 text-xs outline-none" />
            <select value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="w-full rounded-lg bg-input px-3 py-2 text-xs outline-none">
              {REASONS.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
            </select>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Describe what happened, with dates & details" rows={4} className="w-full rounded-lg bg-input px-3 py-2 text-xs outline-none" />
            <button onClick={file} className="w-full rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground">Submit Dispute</button>
            <p className="text-[10px] text-muted-foreground">Filing a fraudulent dispute or chargeback abuse may result in account suspension.</p>
          </div>
        )}

        {list.length === 0 && <div className="rounded-xl bg-card p-8 text-center text-sm text-muted-foreground">No disputes filed.</div>}

        <div className="space-y-2">
          {list.map((d) => (
            <div key={d.id} className="rounded-xl bg-card p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold">{REASONS.find((r) => r.v === d.reason)?.l || d.reason}</p>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  d.status === "open" ? "bg-yellow-500/20 text-yellow-600" :
                  d.status === "investigating" ? "bg-blue-500/20 text-blue-500" :
                  d.status === "resolved" ? "bg-primary/20 text-primary" :
                  "bg-destructive/20 text-destructive"
                }`}>{d.status}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{d.description}</p>
              {d.resolution_note && <p className="mt-1 rounded bg-muted/50 p-2 text-[11px]"><strong>Resolution:</strong> {d.resolution_note}</p>}
              <p className="mt-1 text-[10px] text-muted-foreground">{new Date(d.created_at).toLocaleString()}</p>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
