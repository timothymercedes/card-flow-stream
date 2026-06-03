import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ShieldCheck, Ban, Pause, Flag, MessageSquare, ShoppingBag, User as UserIcon, Radio, FileText, Tag, Crown, UserCog, X, LifeBuoy, BadgeCheck, Video, Gauge, Bell } from "lucide-react";
import { SupportInbox } from "@/components/admin/SupportInbox";
import { VerificationInbox } from "@/components/admin/VerificationInbox";
import { TutorialsAdmin } from "@/components/admin/TutorialsAdmin";
import { AuditLogsAdmin } from "@/components/admin/AuditLogsAdmin";
import { BetaInvitesAdmin } from "@/components/admin/BetaInvitesAdmin";
import { PlatformRevenueAdmin } from "@/components/admin/PlatformRevenueAdmin";
import { BuyerRiskQueue } from "@/components/admin/BuyerRiskQueue";
import { AdminUserSearch } from "@/components/admin/AdminUserSearch";
import { AdminReportsQueue } from "@/components/admin/AdminReportsQueue";
import { AdminDisputesQueue } from "@/components/admin/AdminDisputesQueue";
import { AdminEvidenceQueue } from "@/components/admin/AdminEvidenceQueue";
import { AdminAuditLog } from "@/components/admin/AdminAuditLog";
import { adminCreateConnectLoginLink } from "@/lib/stripe-connect.functions";
import { sendTestPush } from "@/lib/push.functions";
import { cancelOrderAction } from "@/lib/order-actions.functions";
import { DisputeThread } from "@/components/DisputeThread";
import { useRealtimeChannel } from "@/lib/realtime";

type Role = "owner" | "admin" | "moderator" | "support";
const ROLE_BADGES: Record<Role, string> = {
  owner: "bg-yellow-500/20 text-yellow-500",
  admin: "bg-primary/20 text-primary",
  moderator: "bg-blue-500/20 text-blue-500",
  support: "bg-emerald-500/20 text-emerald-500",
};

const REPORT_GROUPS = [
  { key: "all", label: "All", icon: Flag, types: [] as string[] },
  { key: "messages", label: "Chat / Messages", icon: MessageSquare, types: ["message"] },
  { key: "orders", label: "Orders", icon: ShoppingBag, types: ["order"] },
  { key: "users", label: "Users", icon: UserIcon, types: ["user"] },
  { key: "streams", label: "Streams", icon: Radio, types: ["stream"] },
  { key: "posts", label: "Posts", icon: FileText, types: ["post"] },
  { key: "listings", label: "Listings", icon: Tag, types: ["listing"] },
] as const;

type AdminTab = "reports" | "support" | "verifications" | "orders" | "users" | "disputes" | "suspensions" | "roles" | "tutorials" | "audit" | "beta" | "revenue" | "buyer_risk" | "mod_users" | "mod_reports" | "mod_disputes" | "evidence" | "mod_audit";
const ADMIN_TABS: AdminTab[] = ["reports", "support", "verifications", "orders", "users", "disputes", "suspensions", "roles", "tutorials", "audit", "beta", "revenue", "buyer_risk", "mod_users", "mod_reports", "mod_disputes", "evidence", "mod_audit"];


export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — PullBid Live" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    tab: ADMIN_TABS.includes(search.tab as AdminTab) ? (search.tab as AdminTab) : undefined,
    filter: search.filter === "issues" || search.filter === "all" ? (search.filter as "issues" | "all") : undefined,
  }),
  component: Admin,
});

function Admin() {
  const { user } = useAuth();
  const search = Route.useSearch();
  const [myRoles, setMyRoles] = useState<Role[]>([]);
  const [rolesLoaded, setRolesLoaded] = useState(false);
  const [tab, setTab] = useState<AdminTab>(search.tab ?? "reports");
  const [openSupport, setOpenSupport] = useState(0);
  const [pendingVerifications, setPendingVerifications] = useState(0);
  const [disputes, setDisputes] = useState<any[]>([]);
  const [suspensions, setSuspensions] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [reportFilter, setReportFilter] = useState<typeof REPORT_GROUPS[number]["key"]>("all");
  const [reportStatus, setReportStatus] = useState<"open" | "all">("open");
  const [banForm, setBanForm] = useState({ user_id: "", username: "", reason: "", type: "suspension", days: "7" });
  const [roles, setRoles] = useState<{ user_id: string; role: Role; username?: string }[]>([]);
  const [roleForm, setRoleForm] = useState({ username: "", role: "moderator" as Role });
  const [orders, setOrders] = useState<any[]>([]);
  const [orderFilter, setOrderFilter] = useState<"all" | "issues">(search.filter ?? "issues");
  const [orderSearch, setOrderSearch] = useState("");

  useEffect(() => { if (search.tab) setTab(search.tab); }, [search.tab]);
  useEffect(() => { if (search.filter) setOrderFilter(search.filter); }, [search.filter]);

  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<any[]>([]);
  const [signupStats, setSignupStats] = useState<{ total: number; last_24h: number; last_7d: number } | null>(null);
  const [recentSignups, setRecentSignups] = useState<any[]>([]);
  const [sendingTest, setSendingTest] = useState(false);
  const sendTestPushFn = useServerFn(sendTestPush);

  const isOwner = myRoles.includes("owner");
  const isAdmin = isOwner || myRoles.includes("admin");
  const canViewAdmin = isAdmin || myRoles.includes("moderator") || myRoles.includes("support");

  useEffect(() => {
    if (!user) { setRolesLoaded(true); return; }
    supabase.from("user_roles").select("role").eq("user_id", user.id)
      .then(({ data }) => { setMyRoles(((data || []) as any[]).map(r => r.role)); setRolesLoaded(true); });
  }, [user]);

  async function loadAll() {
    const [{ data: d }, { data: s }, { data: r }] = await Promise.all([
      supabase.from("disputes").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("user_suspensions").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("user_reports").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    setDisputes(d || []);
    setSuspensions(s || []);
    setReports(r || []);
  }

  async function loadRoles() {
    const { data } = await supabase.from("user_roles").select("user_id, role");
    const list = (data || []) as { user_id: string; role: Role }[];
    if (list.length === 0) { setRoles([]); return; }
    const { data: profs } = await supabase.from("profiles").select("id, username").in("id", list.map(r => r.user_id));
    const map = new Map((profs || []).map((p: any) => [p.id, p.username]));
    setRoles(list.map(r => ({ ...r, username: map.get(r.user_id) })).sort((a, b) =>
      (["owner","admin","moderator","support"].indexOf(a.role) - ["owner","admin","moderator","support"].indexOf(b.role))
    ));
  }

  async function assignRole() {
    if (!roleForm.username) return toast.error("Enter a username");
    const { data: prof } = await supabase.from("profiles").select("id").eq("username", roleForm.username).maybeSingle();
    if (!prof) return toast.error("User not found");
    const { error } = await (supabase.rpc as any)("admin_assign_role", { _target_user: (prof as any).id, _role: roleForm.role });
    if (error) return toast.error(error.message);
    toast.success(`Granted ${roleForm.role}`);
    setRoleForm({ username: "", role: "moderator" });
    loadRoles();
  }

  async function removeRole(user_id: string, role: Role) {
    const { error } = await (supabase.rpc as any)("admin_remove_role", { _target_user: user_id, _role: role });
    if (error) return toast.error(error.message);
    toast.success("Role removed");
    loadRoles();
  }

  useEffect(() => { if (canViewAdmin) loadAll(); }, [canViewAdmin]);
  const refreshSupport = async () => {
    const { count } = await supabase
      .from("support_tickets")
      .select("id", { head: true, count: "exact" })
      .in("status", ["open", "pending"]);
    setOpenSupport(count || 0);
  };
  useEffect(() => { if (canViewAdmin) refreshSupport(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [canViewAdmin]);
  useRealtimeChannel({ name: "admin-support-count", enabled: canViewAdmin }, (ch) =>
    ch.on("postgres_changes" as any, { event: "*", schema: "public", table: "support_tickets" } as any, () => refreshSupport()));

  const refreshVerif = async () => {
    const { count } = await supabase
      .from("profiles")
      .select("id", { head: true, count: "exact" })
      .in("verification_status", ["pending", "reverify_required"]);
    setPendingVerifications(count || 0);
  };
  useEffect(() => { if (canViewAdmin) refreshVerif(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [canViewAdmin]);
  useRealtimeChannel({ name: "admin-verif-count", enabled: canViewAdmin }, (ch) =>
    ch.on("postgres_changes" as any, { event: "*", schema: "public", table: "profiles" } as any, () => refreshVerif()));
  useEffect(() => { if (isAdmin && tab === "roles") loadRoles(); }, [isAdmin, tab]);
  useEffect(() => { if (canViewAdmin && tab === "orders") loadOrders(); }, [canViewAdmin, tab, orderFilter, orderSearch]);
  useEffect(() => {
    if (!isAdmin) return;
    (supabase.rpc as any)("admin_get_signup_stats").then(({ data }: any) => {
      if (data && data[0]) setSignupStats(data[0]);
    });
    (supabase.rpc as any)("admin_list_recent_signups", { _limit: 50 }).then(({ data }: any) => {
      setRecentSignups((data as any[]) || []);
    });
  }, [isAdmin]);

  
  async function loadOrders() {
    let q = supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(150);
    if (orderFilter === "issues") {
      q = q.in("status", ["pending", "disputed"]);
    }
    if (orderSearch.trim()) {
      const term = orderSearch.trim();
      q = q.or(`order_number.ilike.%${term}%,title.ilike.%${term}%`);
    }
    const { data } = await q;
    setOrders((data as any[]) || []);
  }

  async function searchUsers() {
    if (!userQuery.trim()) { setUserResults([]); return; }
    const { data } = await supabase.from("profiles")
      .select("id, username, avatar_url, is_seller, seller_status, created_at, live_verified")
      .ilike("username", `%${userQuery.trim()}%`).limit(25);
    setUserResults((data as any[]) || []);
  }

  async function toggleLiveVerified(u: { id: string; username: string; live_verified?: boolean }) {
    const next = !u.live_verified;
    const { error } = await supabase.from("profiles").update({ live_verified: next }).eq("id", u.id);
    if (error) return toast.error(error.message);
    toast.success(next ? `@${u.username} can now host & collab` : `Live access revoked for @${u.username}`);
    setUserResults((rs) => rs.map((r) => r.id === u.id ? { ...r, live_verified: next } : r));
  }

  async function quickSuspend(u: { id: string; username: string }, days: number, reason: string) {
    if (!reason) return;
    const expires_at = days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : null;
    const { error } = await supabase.from("user_suspensions").insert({
      user_id: u.id, username: u.username,
      type: days > 0 ? "suspension" : "ban",
      reason, by_admin_id: user!.id, expires_at, active: true,
    });
    if (error) return toast.error(error.message);
    toast.success(days > 0 ? `Suspended @${u.username} for ${days}d` : `Banned @${u.username}`);
    loadAll();
  }

  async function updateReport(id: string, status: "reviewing" | "resolved" | "dismissed") {
    const note = status !== "reviewing" ? window.prompt(`Resolution note for ${status}:`) || "" : "";
    const { error } = await supabase.from("user_reports").update({
      status,
      resolution_note: note || null,
      resolved_by: user!.id,
      resolved_at: status === "reviewing" ? null : new Date().toISOString(),
    }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Updated");
    loadAll();
  }

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

  async function cancelOrder(o: any) {
    if (!window.confirm(`Cancel order "${o.title}"?`)) return;
    try {
      await cancelOrderServer({ data: { orderId: o.id } });
    } catch (error: any) {
      return toast.error(error?.message ?? "Unable to cancel order");
    }
    toast.success("Order cancelled");
    loadOrders();
  }

  async function markRefunded(o: any) {
    const reason = window.prompt("Refund note (optional):") ?? "";
    const { error } = await supabase.from("orders").update({
      status: "refunded", payment_status: "refunded",
      refunded_amount: o.amount, admin_note: reason || null,
    } as any).eq("id", o.id);
    if (error) return toast.error(error.message);
    toast.success("Marked refunded");
    loadOrders();
  }

  async function removeFromStream(o: any) {
    if (!o.stream_id) return toast.error("Not tied to a stream");
    if (!window.confirm("Remove this order from its stream?")) return;
    const { error } = await supabase.from("orders").update({ stream_id: null }).eq("id", o.id);
    if (error) return toast.error(error.message);
    toast.success("Removed from stream");
    loadOrders();
  }

  async function quickBanFromOrder(o: any, who: "buyer" | "seller") {
    const targetId = who === "buyer" ? o.buyer_id : o.seller_id;
    const { data: prof } = await supabase.from("profiles").select("username").eq("id", targetId).maybeSingle();
    const username = (prof as any)?.username || targetId.slice(0, 8);
    const reason = window.prompt(`Reason for banning ${who} @${username}?`);
    if (!reason) return;
    await quickSuspend({ id: targetId, username }, 0, reason);
  }

  const openSellerStripe = useServerFn(adminCreateConnectLoginLink);
  const cancelOrderServer = useServerFn(cancelOrderAction);
  async function manageSellerPayouts(sellerId: string) {
    try {
      const { url } = await openSellerStripe({ data: { sellerId } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast.error(e.message ?? "Could not open seller's Stripe dashboard");
    }
  }


  if (!user) return <AppShell><div className="p-8 text-center text-sm">Sign in.</div></AppShell>;
  if (!rolesLoaded) return <AppShell><div className="p-8 text-center text-sm text-muted-foreground">Loading…</div></AppShell>;
  if (!canViewAdmin) return (
    <AppShell><div className="p-8 text-center">
      <p className="text-sm text-muted-foreground">Admin access required.</p>
      <Link to="/" className="mt-4 inline-block text-xs text-primary">Go home</Link>
    </div></AppShell>
  );

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 py-4 space-y-4">
        <div className="rounded-2xl bg-gradient-to-br from-primary/15 via-accent/10 to-card p-4 shadow-[var(--shadow-card)] ring-1 ring-border/60">
        <div className="flex items-center gap-2">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight lg:text-3xl"><ShieldCheck className="h-6 w-6" /> Admin</h1>
          {myRoles.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {myRoles.map(r => (
                <span key={r} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${ROLE_BADGES[r]}`}>
                  {r === "owner" && <Crown className="h-3 w-3" />} {r}
                </span>
              ))}
            </div>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            {isOwner && (
              <Link to="/admin/finance" className="inline-flex items-center gap-1 rounded-md bg-yellow-500/15 px-2.5 py-1 text-[11px] font-bold text-yellow-500 ring-1 ring-yellow-500/30 active:scale-[0.98]">
                <Crown className="h-3.5 w-3.5" /> Finance
              </Link>
            )}
            <Link to="/admin/push-subscriptions" className="inline-flex items-center gap-1 rounded-md bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground ring-1 ring-border/60 active:scale-[0.98]">
              <Bell className="h-3.5 w-3.5" /> Push
            </Link>
            {isAdmin && (
              <Link to="/admin/collection-wheel" className="inline-flex items-center gap-1 rounded-md bg-accent/15 px-2.5 py-1 text-[11px] font-bold text-accent-foreground ring-1 ring-accent/30 active:scale-[0.98]">
                <Trophy className="h-3.5 w-3.5" /> Reward Wheel
              </Link>
            )}
            <Link to="/admin/performance" className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground shadow-[var(--shadow-primary)] active:scale-[0.98]">
              <Gauge className="h-3.5 w-3.5" /> Performance
            </Link>
          </div>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Moderation, support, verifications & platform health.</p>
        </div>
        {isAdmin && signupStats && (
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-card p-3 text-center shadow-[var(--shadow-card)] ring-1 ring-border/60">
              <p className="text-[10px] uppercase text-muted-foreground">Total signups</p>
              <p className="text-xl font-bold">{signupStats.total}</p>
            </div>
            <div className="rounded-xl bg-card p-3 text-center shadow-[var(--shadow-card)] ring-1 ring-border/60">
              <p className="text-[10px] uppercase text-muted-foreground">Last 24h</p>
              <p className="text-xl font-bold text-primary">{signupStats.last_24h}</p>
            </div>
            <div className="rounded-xl bg-card p-3 text-center shadow-[var(--shadow-card)] ring-1 ring-border/60">
              <p className="text-[10px] uppercase text-muted-foreground">Last 7d</p>
              <p className="text-xl font-bold">{signupStats.last_7d}</p>
            </div>
          </div>
        )}
        {isAdmin && (
          <div className="rounded-xl bg-card p-3 shadow-[var(--shadow-card)] ring-1 ring-border/60">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold">Test push notification</p>
                <p className="text-[11px] text-muted-foreground">Sends a push to your own devices to verify delivery.</p>
              </div>
              <button
                onClick={async () => {
                  setSendingTest(true);
                  try {
                    const r: any = await sendTestPushFn({ data: {} });
                    if (r?.ok) toast.success(`Test push sent (${r.sent} device${r.sent === 1 ? "" : "s"})`);
                    else toast.error(r?.error === "FORBIDDEN" ? "Not allowed" : "Push unavailable");
                  } catch {
                    toast.error("Failed to send test push");
                  } finally {
                    setSendingTest(false);
                  }
                }}
                disabled={sendingTest}
                className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
              >
                {sendingTest ? "Sending…" : "Send test"}
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-b border-border/60 bg-background/85 backdrop-blur sticky top-0 z-10 -mx-1 px-1 py-1">
          <button onClick={() => setTab("reports")} className={`pb-2 text-xs font-bold ${tab === "reports" ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}>Reports ({reports.filter(r => r.status === "open").length})</button>
          <button onClick={() => setTab("support")} className={`inline-flex items-center gap-1 pb-2 text-xs font-bold ${tab === "support" ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}>
            <LifeBuoy className="h-3.5 w-3.5" /> Support ({openSupport})
          </button>
          <button onClick={() => setTab("verifications")} className={`inline-flex items-center gap-1 pb-2 text-xs font-bold ${tab === "verifications" ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}>
            <BadgeCheck className="h-3.5 w-3.5" /> Verifications ({pendingVerifications})
          </button>
          <button onClick={() => setTab("orders")} className={`pb-2 text-xs font-bold ${tab === "orders" ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}>Orders</button>
          <button onClick={() => setTab("disputes")} className={`pb-2 text-xs font-bold ${tab === "disputes" ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}>Disputes ({disputes.filter(d => d.status === "open").length})</button>
          {isAdmin && <button onClick={() => setTab("users")} className={`pb-2 text-xs font-bold ${tab === "users" ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}>Users</button>}
          {isAdmin && <button onClick={() => setTab("suspensions")} className={`pb-2 text-xs font-bold ${tab === "suspensions" ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}>Suspensions</button>}
          {isAdmin && <button onClick={() => setTab("roles")} className={`pb-2 text-xs font-bold ${tab === "roles" ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}>Roles</button>}
          {isAdmin && <button onClick={() => setTab("tutorials")} className={`inline-flex items-center gap-1 pb-2 text-xs font-bold ${tab === "tutorials" ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}><Video className="h-3.5 w-3.5" /> Tutorials</button>}
          {isAdmin && <button onClick={() => setTab("audit")} className={`pb-2 text-xs font-bold ${tab === "audit" ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}>Audit Log</button>}
          {isAdmin && <button onClick={() => setTab("beta")} className={`pb-2 text-xs font-bold ${tab === "beta" ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}>Beta Invites</button>}
          {isAdmin && <button onClick={() => setTab("revenue")} className={`pb-2 text-xs font-bold ${tab === "revenue" ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}>Revenue</button>}
          {isAdmin && <button onClick={() => setTab("buyer_risk")} className={`inline-flex items-center gap-1 pb-2 text-xs font-bold ${tab === "buyer_risk" ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}><ShieldCheck className="h-3.5 w-3.5" /> Buyer Risk</button>}
          {isAdmin && <button onClick={() => setTab("mod_users")} className={`pb-2 text-xs font-bold ${tab === "mod_users" ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}>Mod: Users</button>}
          {isAdmin && <button onClick={() => setTab("mod_reports")} className={`pb-2 text-xs font-bold ${tab === "mod_reports" ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}>Mod: Reports</button>}
          {isAdmin && <button onClick={() => setTab("mod_disputes")} className={`pb-2 text-xs font-bold ${tab === "mod_disputes" ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}>Mod: Disputes</button>}
          {isAdmin && <button onClick={() => setTab("evidence")} className={`pb-2 text-xs font-bold ${tab === "evidence" ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}>Evidence</button>}
          {isAdmin && <button onClick={() => setTab("mod_audit")} className={`pb-2 text-xs font-bold ${tab === "mod_audit" ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}>Mod: Audit</button>}
        </div>

        {tab === "reports" && (() => {
          const group = REPORT_GROUPS.find(g => g.key === reportFilter)!;
          const filtered = reports.filter(r =>
            (group.types.length === 0 || (group.types as readonly string[]).includes(r.target_type)) &&
            (reportStatus === "all" || r.status === "open")
          );
          return (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {REPORT_GROUPS.map(g => {
                  const Icon = g.icon;
                  const count = g.types.length === 0 ? reports.length : reports.filter(r => (g.types as readonly string[]).includes(r.target_type)).length;
                  return (
                    <button key={g.key} onClick={() => setReportFilter(g.key)}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${reportFilter === g.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                      <Icon className="h-3 w-3" /> {g.label} ({count})
                    </button>
                  );
                })}
                <button onClick={() => setReportStatus(reportStatus === "open" ? "all" : "open")}
                  className="ml-auto rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold">
                  {reportStatus === "open" ? "Showing: open" : "Showing: all"}
                </button>
              </div>
              {filtered.map(r => (
                <div key={r.id} className="rounded-xl bg-card p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold truncate">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground mr-1.5">{r.target_type}</span>
                      @{r.reporter_username} → {r.target_label || r.target_id || "—"}
                    </p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${r.status === "open" ? "bg-destructive/20 text-destructive" : "bg-muted text-muted-foreground"}`}>{r.status}</span>
                  </div>
                  <p className="mt-1 text-[11px] font-semibold text-muted-foreground">Category: {r.category}</p>
                  <p className="mt-1 text-xs whitespace-pre-wrap">{r.reason}</p>
                  {r.resolution_note && <p className="mt-1 rounded bg-muted/50 p-2 text-[11px]">{r.resolution_note}</p>}
                  <p className="mt-1 text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleString()}</p>
                  {r.status !== "resolved" && r.status !== "dismissed" && (
                    <div className="mt-2 flex gap-2">
                      <button onClick={() => updateReport(r.id, "reviewing")} className="rounded-lg bg-blue-500/20 px-3 py-1 text-[10px] font-bold text-blue-500">Review</button>
                      <button onClick={() => updateReport(r.id, "resolved")} className="rounded-lg bg-primary px-3 py-1 text-[10px] font-bold text-primary-foreground">Resolve</button>
                      <button onClick={() => updateReport(r.id, "dismissed")} className="rounded-lg bg-destructive/20 px-3 py-1 text-[10px] font-bold text-destructive">Dismiss</button>
                    </div>
                  )}
                </div>
              ))}
              {filtered.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">No reports.</p>}
            </div>
          );
        })()}

        {tab === "support" && <SupportInbox canModerate={isAdmin || myRoles.includes("moderator")} />}

        {tab === "verifications" && <VerificationInbox />}

        {tab === "orders" && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setOrderFilter("issues")} className={`rounded-full px-3 py-1 text-[11px] font-bold ${orderFilter === "issues" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>Issues only</button>
              <button onClick={() => setOrderFilter("all")} className={`rounded-full px-3 py-1 text-[11px] font-bold ${orderFilter === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>All recent</button>
              <input
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                placeholder="Search order # or title…"
                className="min-w-[180px] flex-1 rounded-full bg-muted px-3 py-1 text-[11px] outline-none"
              />
              <span className="ml-auto self-center text-[10px] text-muted-foreground">{orders.length} shown</span>
            </div>
            {orders.map((o) => (
              <div key={o.id} className="rounded-xl bg-card p-3">
                <div className="flex items-start gap-3">
                  {o.item_image_url && <img src={o.item_image_url} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {o.order_number && (
                        <span className="rounded bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-primary">{o.order_number}</span>
                      )}
                      <p className="truncate text-xs font-bold">{o.title}</p>
                    </div>
                    <p className="text-[10px] text-muted-foreground">${Number(o.amount).toFixed(2)} · {o.status} · {o.payment_status}</p>
                    <p className="text-[10px] text-muted-foreground">Buyer: {o.buyer_id.slice(0,8)} · Seller: {o.seller_id.slice(0,8)}</p>
                    <p className="text-[10px] text-muted-foreground">{new Date(o.created_at).toLocaleString()}</p>
                  </div>
                </div>
                {isAdmin && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button onClick={() => cancelOrder(o)} className="rounded-lg bg-muted px-2 py-1 text-[10px] font-bold">Cancel</button>
                    <button onClick={() => markRefunded(o)} className="rounded-lg bg-blue-500/20 px-2 py-1 text-[10px] font-bold text-blue-500">Refund</button>
                    {o.stream_id && (
                      <button onClick={() => removeFromStream(o)} className="rounded-lg bg-amber-500/20 px-2 py-1 text-[10px] font-bold text-amber-500">Remove from stream</button>
                    )}
                    <button onClick={() => quickBanFromOrder(o, "buyer")} className="rounded-lg bg-destructive/20 px-2 py-1 text-[10px] font-bold text-destructive">Ban buyer</button>
                    <button onClick={() => quickBanFromOrder(o, "seller")} className="rounded-lg bg-destructive/20 px-2 py-1 text-[10px] font-bold text-destructive">Ban seller</button>
                    <button onClick={() => manageSellerPayouts(o.seller_id)} className="rounded-lg bg-primary/20 px-2 py-1 text-[10px] font-bold text-primary">Manage seller payouts</button>
                    {o.stream_id && (
                      <Link to="/shows/$id" params={{ id: o.stream_id }} className="rounded-lg bg-muted px-2 py-1 text-[10px] font-bold">Open stream</Link>
                    )}
                  </div>
                )}
              </div>
            ))}
            {orders.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">No orders.</p>}
          </div>
        )}

        {tab === "users" && isAdmin && (
          <div className="space-y-3">
            {signupStats && (
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-card p-3 text-center">
                  <p className="text-[10px] uppercase text-muted-foreground">Total signups</p>
                  <p className="text-xl font-bold">{signupStats.total}</p>
                </div>
                <div className="rounded-xl bg-card p-3 text-center">
                  <p className="text-[10px] uppercase text-muted-foreground">Last 24h</p>
                  <p className="text-xl font-bold text-primary">{signupStats.last_24h}</p>
                </div>
                <div className="rounded-xl bg-card p-3 text-center">
                  <p className="text-[10px] uppercase text-muted-foreground">Last 7d</p>
                  <p className="text-xl font-bold">{signupStats.last_7d}</p>
                </div>
              </div>
            )}
            <div className="rounded-xl bg-card p-3 space-y-2">
              <p className="flex items-center gap-2 text-sm font-bold"><UserIcon className="h-4 w-4" /> Find a user</p>
              <div className="flex gap-2">
                <input value={userQuery} onChange={(e) => setUserQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchUsers()}
                  placeholder="Username (partial OK)"
                  className="flex-1 rounded-lg bg-input px-3 py-2 text-xs outline-none" />
                <button onClick={searchUsers} className="rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground">Search</button>
              </div>
            </div>
            {!userQuery && recentSignups.length > 0 && (
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase text-muted-foreground">Recent signups</p>
                <div className="space-y-2">
                  {recentSignups.map((u) => (
                    <div key={u.id} className="flex items-center gap-2 rounded-xl bg-card p-2.5">
                      {u.avatar_url ? <img src={u.avatar_url} className="h-8 w-8 rounded-full object-cover" alt="" /> : <div className="h-8 w-8 rounded-full bg-muted" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold">@{u.username}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {u.is_seller ? "Seller" : "Buyer"} · {new Date(u.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Link to="/seller/$username" params={{ username: u.username }}
                        className="rounded-lg bg-muted px-3 py-1 text-[10px] font-bold">View</Link>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {userResults.map((u) => {
              const activeSusp = suspensions.find((s) => s.user_id === u.id && s.active);
              return (
                <div key={u.id} className="rounded-xl bg-card p-3">
                  <div className="flex items-center gap-2">
                    {u.avatar_url && <img src={u.avatar_url} className="h-8 w-8 rounded-full object-cover" alt="" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold">@{u.username}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {u.is_seller ? "Seller" : "Buyer"} · joined {new Date(u.created_at).toLocaleDateString()}
                        {activeSusp && <span className="ml-2 rounded-full bg-destructive/20 px-1.5 py-0.5 font-bold text-destructive">{activeSusp.type}</span>}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Link to="/seller/$username" params={{ username: u.username }} className="rounded-lg bg-muted px-3 py-1 text-[10px] font-bold">View profile</Link>
                    {!activeSusp && (
                      <>
                        <button onClick={() => quickSuspend(u, 1, window.prompt("Reason for 1-day suspension?") || "")}
                          className="rounded-lg bg-yellow-500/20 px-3 py-1 text-[10px] font-bold text-yellow-500">Suspend 1d</button>
                        <button onClick={() => quickSuspend(u, 7, window.prompt("Reason for 7-day suspension?") || "")}
                          className="rounded-lg bg-orange-500/20 px-3 py-1 text-[10px] font-bold text-orange-500">Suspend 7d</button>
                        <button onClick={() => quickSuspend(u, 0, window.prompt("Reason for permanent ban?") || "")}
                          className="rounded-lg bg-destructive/20 px-3 py-1 text-[10px] font-bold text-destructive">Ban</button>
                      </>
                    )}
                    <button onClick={() => toggleLiveVerified(u)}
                      className={`rounded-lg px-3 py-1 text-[10px] font-bold ${u.live_verified ? "bg-primary/20 text-primary" : "bg-muted"}`}>
                      {u.live_verified ? "✓ Live verified" : "Verify for live"}
                    </button>
                    {activeSusp && (
                      <button onClick={() => lift(activeSusp.id)} className="rounded-lg bg-muted px-3 py-1 text-[10px] font-bold">Lift {activeSusp.type}</button>
                    )}
                  </div>
                </div>
              );
            })}
            {userQuery && userResults.length === 0 && <p className="py-8 text-center text-xs text-muted-foreground">No users matched.</p>}
          </div>
        )}

        {tab === "disputes" && (
          <div className="space-y-2">
            {disputes.map((d) => (
              <AdminDisputeRow
                key={d.id}
                d={d}
                onResolve={resolveDispute}
                onRefund={async (orderId) => {
                  const { data: o } = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle();
                  if (o) await markRefunded(o);
                }}
                onCancelOrder={async (orderId) => {
                  const { data: o } = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle();
                  if (o) await cancelOrder(o);
                }}
                onBan={async (uid) => {
                  const { data: prof } = await supabase.from("profiles").select("username").eq("id", uid).maybeSingle();
                  const username = (prof as any)?.username || uid.slice(0, 8);
                  const reason = window.prompt(`Reason for banning @${username}?`);
                  if (!reason) return;
                  await quickSuspend({ id: uid, username }, 0, reason);
                }}
              />
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

        {tab === "roles" && isAdmin && (
          <div className="space-y-3">
            <div className="rounded-xl bg-card p-4 space-y-2">
              <p className="flex items-center gap-2 text-sm font-bold"><UserCog className="h-4 w-4" /> Assign role</p>
              <input placeholder="Username" value={roleForm.username} onChange={(e) => setRoleForm({ ...roleForm, username: e.target.value })}
                className="w-full rounded-lg bg-input px-3 py-2 text-xs outline-none" />
              <select value={roleForm.role} onChange={(e) => setRoleForm({ ...roleForm, role: e.target.value as Role })}
                className="w-full rounded-lg bg-input px-3 py-2 text-xs outline-none">
                {isOwner && <option value="admin">Admin</option>}
                <option value="moderator">Moderator</option>
                <option value="support">Support</option>
              </select>
              <button onClick={assignRole} className="w-full rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground">Grant role</button>
              <p className="text-[10px] text-muted-foreground">
                {isOwner ? "As owner you can grant admin, moderator, or support." : "Admins can grant moderator and support. Only the owner can grant admin."}
              </p>
            </div>
            <div className="space-y-2">
              {roles.map((r) => (
                <div key={`${r.user_id}-${r.role}`} className="flex items-center justify-between rounded-xl bg-card p-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${ROLE_BADGES[r.role]}`}>
                      {r.role === "owner" && <Crown className="h-3 w-3" />} {r.role}
                    </span>
                    <p className="truncate text-xs font-bold">@{r.username || r.user_id.slice(0, 8)}</p>
                  </div>
                  {r.role !== "owner" && (isOwner || r.role !== "admin") && (
                    <button onClick={() => removeRole(r.user_id, r.role)}
                      className="rounded-lg bg-destructive/20 p-1.5 text-destructive" title="Remove role">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {roles.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">No role assignments.</p>}
            </div>
          </div>
        )}

        {tab === "tutorials" && isAdmin && <TutorialsAdmin />}
        {tab === "audit" && isAdmin && <AuditLogsAdmin />}
        {tab === "beta" && isAdmin && <BetaInvitesAdmin />}
        {tab === "revenue" && isAdmin && <PlatformRevenueAdmin />}
        {tab === "buyer_risk" && isAdmin && <BuyerRiskQueue />}
        {tab === "mod_users" && isAdmin && <AdminUserSearch />}
        {tab === "mod_reports" && isAdmin && <AdminReportsQueue />}
        {tab === "mod_disputes" && isAdmin && <AdminDisputesQueue />}
        {tab === "evidence" && isAdmin && <AdminEvidenceQueue />}
        {tab === "mod_audit" && isAdmin && <AdminAuditLog />}
      </div>
    </AppShell>
  );
}

function AdminDisputeRow({
  d, onResolve, onRefund, onCancelOrder, onBan,
}: {
  d: any;
  onResolve: (id: string, status: "resolved" | "rejected" | "investigating") => void;
  onRefund: (orderId: string) => void | Promise<void>;
  onCancelOrder: (orderId: string) => void | Promise<void>;
  onBan: (userId: string) => void | Promise<void>;
}) {
  const [order, setOrder] = useState<any | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!d.order_id) return;
    supabase.from("orders")
      .select("id, title, amount, payment_status, status, buyer_id, seller_id, stream_id")
      .eq("id", d.order_id)
      .maybeSingle()
      .then(({ data }) => setOrder(data));
  }, [d.order_id]);

  const closed = d.status === "resolved" || d.status === "rejected";

  return (
    <div className="rounded-xl bg-card p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold">@{d.reporter_username} — {d.reason}</p>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
          d.status === "open" ? "bg-yellow-500/20 text-yellow-600" :
          d.status === "investigating" ? "bg-blue-500/20 text-blue-500" :
          d.status === "resolved" ? "bg-primary/20 text-primary" :
          "bg-destructive/20 text-destructive"
        }`}>{d.status}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{d.description}</p>
      {order && (
        <div className="mt-2 rounded-lg bg-muted/40 p-2 text-[11px]">
          <p className="font-semibold">Order: {order.title} — ${Number(order.amount).toFixed(2)} · {order.payment_status} / {order.status}</p>
          <p className="text-muted-foreground">Buyer {order.buyer_id.slice(0,8)} · Seller {order.seller_id.slice(0,8)}{order.stream_id ? ` · Stream ${order.stream_id.slice(0,8)}` : ""}</p>
          {!closed && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {order.payment_status === "paid" && (
                <button onClick={() => onRefund(order.id)} className="rounded-lg bg-blue-500/20 px-2 py-1 text-[10px] font-bold text-blue-500">Refund</button>
              )}
              {order.status !== "cancelled" && (
                <button onClick={() => onCancelOrder(order.id)} className="rounded-lg bg-muted px-2 py-1 text-[10px] font-bold">Cancel order</button>
              )}
              <button onClick={() => onBan(order.buyer_id)} className="rounded-lg bg-destructive/20 px-2 py-1 text-[10px] font-bold text-destructive">Ban buyer</button>
              <button onClick={() => onBan(order.seller_id)} className="rounded-lg bg-destructive/20 px-2 py-1 text-[10px] font-bold text-destructive">Ban seller</button>
            </div>
          )}
        </div>
      )}
      {d.order_id && !order && <p className="mt-1 text-[10px] text-muted-foreground">Order: {d.order_id}</p>}
      {d.resolution_note && <p className="mt-1 rounded bg-muted/50 p-2 text-[11px]"><strong>Resolution:</strong> {d.resolution_note}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {!closed && (
          <>
            <button onClick={() => onResolve(d.id, "investigating")} className="rounded-lg bg-blue-500/20 px-3 py-1 text-[10px] font-bold text-blue-500">Investigate</button>
            <button onClick={() => onResolve(d.id, "resolved")} className="rounded-lg bg-primary px-3 py-1 text-[10px] font-bold text-primary-foreground">Resolve</button>
            <button onClick={() => onResolve(d.id, "rejected")} className="rounded-lg bg-destructive/20 px-3 py-1 text-[10px] font-bold text-destructive">Reject</button>
          </>
        )}
        <button onClick={() => setOpen((v) => !v)} className="ml-auto rounded-lg bg-muted px-3 py-1 text-[10px] font-bold">
          {open ? "Hide thread" : "Open thread"}
        </button>
      </div>

      {open && <DisputeThread disputeId={d.id} allowEvidence={false} />}
    </div>
  );
}
