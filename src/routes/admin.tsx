import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ShieldCheck, Ban, Pause, Flag, MessageSquare, ShoppingBag, User as UserIcon, Radio, FileText, Tag } from "lucide-react";

const REPORT_GROUPS = [
  { key: "all", label: "All", icon: Flag, types: [] as string[] },
  { key: "messages", label: "Chat / Messages", icon: MessageSquare, types: ["message"] },
  { key: "orders", label: "Orders", icon: ShoppingBag, types: ["order"] },
  { key: "users", label: "Users", icon: UserIcon, types: ["user"] },
  { key: "streams", label: "Streams", icon: Radio, types: ["stream"] },
  { key: "posts", label: "Posts", icon: FileText, types: ["post"] },
  { key: "listings", label: "Listings", icon: Tag, types: ["listing"] },
] as const;

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — PullBid Live" }] }),
  component: Admin,
});

function Admin() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState<"disputes" | "suspensions">("disputes");
  const [disputes, setDisputes] = useState<any[]>([]);
  const [suspensions, setSuspensions] = useState<any[]>([]);
  const [banForm, setBanForm] = useState({ user_id: "", username: "", reason: "", type: "suspension", days: "7" });

  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle()
      .then(({ data }) => setIsAdmin(!!data));
  }, [user]);

  async function loadAll() {
    const [{ data: d }, { data: s }] = await Promise.all([
      supabase.from("disputes").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("user_suspensions").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    setDisputes(d || []);
    setSuspensions(s || []);
  }
  useEffect(() => { if (isAdmin) loadAll(); }, [isAdmin]);

  async function resolveDispute(id: string, status: "resolved" | "rejected" | "investigating") {
    const note = status === "resolved" || status === "rejected" ? window.prompt(`Resolution note for ${status}:`) || "" : "";
    const { error } = await supabase.from("disputes").update({
      status, resolution_note: note || null,
      resolved_by: user!.id, resolved_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Updated");
    loadAll();
  }

  async function suspend() {
    if (!banForm.user_id || !banForm.username || !banForm.reason) return toast.error("All fields required");
    const expires_at = banForm.type === "ban" ? null :
      new Date(Date.now() + Number(banForm.days || 7) * 86400000).toISOString();
    const { error } = await supabase.from("user_suspensions").insert({
      user_id: banForm.user_id,
      username: banForm.username,
      type: banForm.type,
      reason: banForm.reason,
      by_admin_id: user!.id,
      expires_at,
      active: true,
    });
    if (error) return toast.error(error.message);
    toast.success(banForm.type === "ban" ? "User banned" : "User suspended");
    setBanForm({ user_id: "", username: "", reason: "", type: "suspension", days: "7" });
    loadAll();
  }

  async function lift(id: string) {
    const { error } = await supabase.from("user_suspensions").update({ active: false }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Lifted");
    loadAll();
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
        <h1 className="flex items-center gap-2 text-2xl font-bold"><ShieldCheck className="h-6 w-6" /> Admin</h1>
        <div className="flex gap-2 border-b border-border">
          <button onClick={() => setTab("disputes")} className={`pb-2 text-xs font-bold ${tab === "disputes" ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}>Disputes ({disputes.filter(d => d.status === "open").length})</button>
          <button onClick={() => setTab("suspensions")} className={`pb-2 text-xs font-bold ${tab === "suspensions" ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}>Suspensions</button>
        </div>

        {tab === "disputes" && (
          <div className="space-y-2">
            {disputes.map((d) => (
              <div key={d.id} className="rounded-xl bg-card p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold">@{d.reporter_username} — {d.reason}</p>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold">{d.status}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{d.description}</p>
                {d.order_id && <p className="text-[10px] text-muted-foreground">Order: {d.order_id}</p>}
                {d.resolution_note && <p className="mt-1 rounded bg-muted/50 p-2 text-[11px]">{d.resolution_note}</p>}
                {d.status !== "resolved" && d.status !== "rejected" && (
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => resolveDispute(d.id, "investigating")} className="rounded-lg bg-blue-500/20 px-3 py-1 text-[10px] font-bold text-blue-500">Investigate</button>
                    <button onClick={() => resolveDispute(d.id, "resolved")} className="rounded-lg bg-primary px-3 py-1 text-[10px] font-bold text-primary-foreground">Resolve</button>
                    <button onClick={() => resolveDispute(d.id, "rejected")} className="rounded-lg bg-destructive/20 px-3 py-1 text-[10px] font-bold text-destructive">Reject</button>
                  </div>
                )}
              </div>
            ))}
            {disputes.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">No disputes.</p>}
          </div>
        )}

        {tab === "suspensions" && (
          <>
            <div className="rounded-xl bg-card p-4 space-y-2">
              <p className="text-sm font-bold">Suspend or ban a user</p>
              <input placeholder="User ID (uuid)" value={banForm.user_id} onChange={(e) => setBanForm({ ...banForm, user_id: e.target.value })} className="w-full rounded-lg bg-input px-3 py-2 text-xs outline-none" />
              <input placeholder="Username" value={banForm.username} onChange={(e) => setBanForm({ ...banForm, username: e.target.value })} className="w-full rounded-lg bg-input px-3 py-2 text-xs outline-none" />
              <input placeholder="Reason" value={banForm.reason} onChange={(e) => setBanForm({ ...banForm, reason: e.target.value })} className="w-full rounded-lg bg-input px-3 py-2 text-xs outline-none" />
              <div className="flex gap-2">
                <select value={banForm.type} onChange={(e) => setBanForm({ ...banForm, type: e.target.value })} className="flex-1 rounded-lg bg-input px-3 py-2 text-xs outline-none">
                  <option value="suspension">Suspension (temporary)</option>
                  <option value="ban">Ban (permanent)</option>
                </select>
                {banForm.type === "suspension" && (
                  <input type="number" min="1" placeholder="Days" value={banForm.days} onChange={(e) => setBanForm({ ...banForm, days: e.target.value })} className="w-20 rounded-lg bg-input px-3 py-2 text-xs outline-none" />
                )}
              </div>
              <button onClick={suspend} className="flex w-full items-center justify-center gap-2 rounded-lg bg-destructive py-2 text-xs font-bold text-destructive-foreground">
                {banForm.type === "ban" ? <Ban className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                {banForm.type === "ban" ? "Ban User" : "Suspend User"}
              </button>
            </div>
            <div className="space-y-2">
              {suspensions.map((s) => (
                <div key={s.id} className="rounded-xl bg-card p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold">@{s.username} — {s.type}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${s.active ? "bg-destructive/20 text-destructive" : "bg-muted text-muted-foreground"}`}>
                      {s.active ? "active" : "lifted"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{s.reason}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {s.expires_at ? `Until ${new Date(s.expires_at).toLocaleString()}` : "Permanent"}
                  </p>
                  {s.active && <button onClick={() => lift(s.id)} className="mt-2 rounded-lg bg-muted px-3 py-1 text-[10px] font-bold">Lift</button>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
