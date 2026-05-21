/**
 * LiveSellerDashboard — rebuilt for full real-time + clickable workflows.
 *
 * Tabs:
 *  - Watchers  → live presence (useStreamPresence). Click → moderation menu.
 *  - Buyers    → distinct paid buyers in this stream. Click → BuyerOrderPopover.
 *  - Pending   → orders awaiting_payment/processing/failed. Realtime flips ✅ on fix.
 *  - Winners   → recent paid orders. Click → BuyerOrderPopover.
 *  - Mods      → stream_moderators with add/remove.
 *  - Activity  → unified feed of orders, tips, promo, mod actions, joins.
 *  - Chat      → moderation controls (audience + slow mode).
 *
 * Top stats strip: Gross, Orders, Show time, Tips+Promo, Shares, Bookmarks, Watchers.
 * Everything subscribes to `dash-${streamId}` so the badges flip in real time.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  DollarSign, ShoppingBag, Clock, Gift, Share2, Bookmark, X, Minimize2, Maximize2,
  MessageCircle, Users, Activity, Shield, Trophy, CreditCard, UserPlus,
  Trash2, VolumeX, Ban, Clock4, UserX,
} from "lucide-react";
import { BuyerOrderPopover } from "@/components/BuyerOrderPopover";
import { useStreamPresence } from "@/hooks/useStreamPresence";
import { toast } from "sonner";

type Stats = {
  grossSales: number;
  orderCount: number;
  tipsAndPromo: number;
  pendingPayments: number;
  bookmarks: number;
};

type ActivityRow = {
  id: string;
  kind: "order" | "tip" | "promo" | "mod" | "join";
  text: string;
  amount?: number;
  at: string;
};

type OrderRow = {
  id: string;
  buyer_id: string;
  buyer_username: string;
  title: string;
  amount: number;
  payment_status: string;
  created_at: string;
};

type ModRow = { mod_user_id: string; mod_username: string };
type ChatMsg = { id: string; user_id: string | null; username: string; content: string; created_at: string };
type Tab = "stats" | "watchers" | "buyers" | "pending" | "winners" | "mods" | "activity" | "chat";

function fmtMoney(n: number) {
  const v = Number(n) || 0;
  if (v >= 10000) return `$${(v / 1000).toFixed(1)}k`;
  if (v >= 1000) return `$${(v / 1000).toFixed(2)}k`;
  // Show cents for non-zero small amounts so $1.23 doesn't render as "$1"
  return v > 0 && v < 100 ? `$${v.toFixed(2)}` : `$${Math.round(v)}`;
}
function fmtElapsed(ms: number) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}


async function applyMod(streamId: string, targetId: string, targetUsername: string, action: "mute" | "timeout" | "ban" | "unmute" | "unban", durationSec = 0) {
  if (action === "unmute" || action === "unban") {
    await supabase.from("stream_chat_actions").insert({
      stream_id: streamId, target_user_id: targetId, target_username: targetUsername, action,
    } as any);
    if (action === "unban") {
      await supabase.from("stream_user_bans").delete().eq("stream_id", streamId).eq("banned_user_id", targetId);
    }
    toast.success(`@${targetUsername} ${action === "unmute" ? "unmuted" : "unbanned"}`);
    return;
  }
  const expires = durationSec > 0 ? new Date(Date.now() + durationSec * 1000).toISOString() : null;
  await supabase.from("stream_chat_actions").insert({
    stream_id: streamId, target_user_id: targetId, target_username: targetUsername,
    action, expires_at: expires,
  } as any);
  if (action === "ban") {
    await supabase.from("stream_user_bans").upsert({
      stream_id: streamId, banned_user_id: targetId,
    } as any, { onConflict: "stream_id,banned_user_id" });
  }
  toast.success(`@${targetUsername} ${action === "mute" ? "muted" : action === "timeout" ? `timed out ${durationSec}s` : "banned"}`);
}

export function LiveSellerDashboard({
  streamId, hostId, startedAt, viewerCount, chatMessages, scheduledShowId, isFlex = false,
  chatAudience, onChangeChatAudience, slowModeSec, onChangeSlowMode,
  currentUserId, currentUsername, currentAvatarUrl,
}: {
  streamId: string;
  hostId: string;
  startedAt: string | null;
  viewerCount: number;
  chatMessages: ChatMsg[];
  scheduledShowId?: string | null;
  isFlex?: boolean;
  chatAudience?: "public" | "mods_only" | "host_mods";
  onChangeChatAudience?: (a: "public" | "mods_only" | "host_mods") => void;
  slowModeSec?: number;
  onChangeSlowMode?: (s: number) => void;
  currentUserId?: string | null;
  currentUsername?: string | null;
  currentAvatarUrl?: string | null;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [tab, setTab] = useState<Tab>("chat");
  const [stats, setStats] = useState<Stats>({ grossSales: 0, orderCount: 0, tipsAndPromo: 0, pendingPayments: 0, bookmarks: 0 });
  const [shareCount, setShareCount] = useState(0);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [mods, setMods] = useState<ModRow[]>([]);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [openUser, setOpenUser] = useState<{ id: string; username: string } | null>(null);
  const [openStat, setOpenStat] = useState<null | "gross" | "time" | "tips" | "shares" | "saves">(null);
  const [addModSearch, setAddModSearch] = useState("");
  const [, setTick] = useState(0);

  const { viewers } = useStreamPresence(streamId, currentUserId ?? null, currentUsername ?? null, currentAvatarUrl ?? null);

  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(i);
  }, []);

  // Single load+subscribe for orders/tips/promo/mods/activity
  useEffect(() => {
    let cancelled = false;
    async function loadAll() {
      const [ordersRes, tipsRes, promoRes, modsRes, mutesRes, bookmarksRes] = await Promise.all([
        supabase.from("orders").select("id, buyer_id, title, amount, payment_status, created_at").eq("stream_id", streamId).order("created_at", { ascending: false }),
        supabase.from("stream_tips").select("id, buyer_id, buyer_username, amount, status, created_at").eq("stream_id", streamId).order("created_at", { ascending: false }),
        supabase.from("stream_promotions").select("id, promoter_id, promoter_username, amount, status, created_at").eq("stream_id", streamId).order("created_at", { ascending: false }),
        supabase.from("stream_moderators").select("mod_user_id, mod_username").eq("stream_id", streamId),
        supabase.from("stream_chat_actions").select("target_user_id, target_username, action, expires_at, created_at").eq("stream_id", streamId).order("created_at", { ascending: false }).limit(30),
        scheduledShowId
          ? supabase.from("show_bookmarks" as any).select("id", { count: "exact", head: true }).eq("show_id", scheduledShowId)
          : Promise.resolve({ count: 0 } as any),
      ]);
      if (cancelled) return;

      const ordersData = ordersRes.data || [];
      const tips = (tipsRes.data || []).filter((t: any) => t.status === "paid");
      const promos = (promoRes.data || []).filter((p: any) => p.status === "paid");
      const paidOrders = ordersData.filter((o: any) => o.payment_status === "paid");
      const pendingOrders = ordersData.filter((o: any) => o.payment_status !== "paid");

      setStats({
        grossSales: paidOrders.reduce((s: number, o: any) => s + Number(o.amount || 0), 0),
        orderCount: ordersData.length,
        tipsAndPromo:
          tips.reduce((s: number, t: any) => s + Number(t.amount || 0), 0) +
          promos.reduce((s: number, p: any) => s + Number(p.amount || 0), 0),
        pendingPayments: pendingOrders.length,
        bookmarks: (bookmarksRes as any)?.count || 0,
      });

      // Enrich buyer usernames
      const buyerIds = Array.from(new Set(ordersData.map((o: any) => o.buyer_id).filter(Boolean)));
      const usernameMap = new Map<string, string>();
      if (buyerIds.length > 0) {
        const { data: profs } = await supabase.from("profiles").select("id, username").in("id", buyerIds);
        (profs || []).forEach((p: any) => usernameMap.set(p.id, p.username));
      }
      setOrders(
        ordersData.map((o: any) => ({
          id: o.id, buyer_id: o.buyer_id,
          buyer_username: usernameMap.get(o.buyer_id) || "buyer",
          title: o.title, amount: Number(o.amount || 0),
          payment_status: o.payment_status, created_at: o.created_at,
        })),
      );

      setMods((modsRes.data || []) as ModRow[]);

      // Activity feed
      const acts: ActivityRow[] = [];
      paidOrders.slice(0, 15).forEach((o: any) => acts.push({
        id: `o-${o.id}`, kind: "order", text: `Order paid · ${o.title}`,
        amount: Number(o.amount), at: o.created_at,
      }));
      tips.slice(0, 10).forEach((t: any) => acts.push({
        id: `t-${t.id}`, kind: "tip", text: `Tip from @${t.buyer_username}`,
        amount: Number(t.amount), at: t.created_at,
      }));
      promos.slice(0, 10).forEach((p: any) => acts.push({
        id: `p-${p.id}`, kind: "promo", text: `Promo from @${p.promoter_username}`,
        amount: Number(p.amount), at: p.created_at,
      }));
      (mutesRes.data || []).forEach((a: any) => acts.push({
        id: `m-${a.created_at}-${a.target_user_id}`, kind: "mod",
        text: `${a.action} · @${a.target_username || "user"}`, at: a.created_at,
      }));
      acts.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      setActivity(acts.slice(0, 40));
    }
    loadAll();
    const ch = supabase
      .channel(`dash-${streamId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `stream_id=eq.${streamId}` }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "stream_tips", filter: `stream_id=eq.${streamId}` }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "stream_promotions", filter: `stream_id=eq.${streamId}` }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "stream_chat_actions", filter: `stream_id=eq.${streamId}` }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "stream_moderators", filter: `stream_id=eq.${streamId}` }, loadAll)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [streamId, scheduledShowId]);

  // local share count
  useEffect(() => {
    const key = `pb-share-count-${streamId}`;
    setShareCount(Number(localStorage.getItem(key) || "0"));
    function onShare(e: Event) {
      const ce = e as CustomEvent<{ streamId: string }>;
      if (ce.detail?.streamId !== streamId) return;
      const n = Number(localStorage.getItem(key) || "0") + 1;
      localStorage.setItem(key, String(n));
      setShareCount(n);
    }
    window.addEventListener("pb:share", onShare as EventListener);
    return () => window.removeEventListener("pb:share", onShare as EventListener);
  }, [streamId]);

  const showTime = startedAt ? Date.now() - new Date(startedAt).getTime() : 0;
  const livePresenceCount = viewers.length || viewerCount || 0;

  const distinctBuyers = useMemo(() => {
    const m = new Map<string, { buyer_id: string; buyer_username: string; total: number; count: number }>();
    orders.filter((o) => o.payment_status === "paid").forEach((o) => {
      const cur = m.get(o.buyer_id);
      if (cur) { cur.total += o.amount; cur.count += 1; }
      else m.set(o.buyer_id, { buyer_id: o.buyer_id, buyer_username: o.buyer_username, total: o.amount, count: 1 });
    });
    return Array.from(m.values());
  }, [orders]);

  const pendingOrders = useMemo(
    () => orders.filter((o) => ["awaiting_payment", "processing", "failed"].includes(o.payment_status)),
    [orders],
  );
  const winners = useMemo(
    () => orders.filter((o) => o.payment_status === "paid").slice(0, 30),
    [orders],
  );

  async function addModerator() {
    const q = addModSearch.trim().replace(/^@/, "");
    if (!q) return;
    const { data: prof } = await supabase.from("profiles").select("id, username").ilike("username", q).maybeSingle();
    if (!prof) { toast.error(`No user @${q}`); return; }
    const { error } = await supabase.from("stream_moderators").insert({
      stream_id: streamId, mod_user_id: (prof as any).id, mod_username: (prof as any).username,
    } as any);
    if (error) toast.error(error.message);
    else { toast.success(`@${(prof as any).username} promoted to mod`); setAddModSearch(""); }
  }

  async function removeModerator(modUserId: string, username: string) {
    const { error } = await supabase.from("stream_moderators").delete()
      .eq("stream_id", streamId).eq("mod_user_id", modUserId);
    if (error) toast.error(error.message);
    else toast.success(`@${username} removed as mod`);
  }

  if (hidden) {
    return (
      <button
        onClick={() => setHidden(false)}
        className="pointer-events-auto flex items-center gap-1 rounded-l-lg bg-primary/90 px-2 py-2 text-[10px] font-bold text-primary-foreground shadow-lg backdrop-blur"
        title="Open Seller Dashboard"
      >
        📊 <span className="hidden md:inline">Dashboard</span>
      </button>
    );
  }

  const StatTile = ({ icon: Icon, label, value, accent, onClick }: { icon: any; label: string; value: string; accent?: string; onClick?: () => void }) => (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-w-0 flex-col rounded-lg bg-black/60 px-2 py-1.5 text-left ring-1 ring-white/10 backdrop-blur transition hover:bg-white/10 hover:ring-white/25 active:scale-[0.98] ${accent || ""}`}
      title={`View ${label} details`}
    >
      <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-white/60">
        <Icon className="h-2.5 w-2.5" /> {label}
      </div>
      <div className="truncate text-sm font-extrabold tabular-nums leading-tight text-white">{value}</div>
    </button>
  );

  const TabBtn = ({ id, icon: Icon, label, count }: { id: Tab; icon: any; label: string; count?: number }) => (
    <button
      onClick={() => setTab(id)}
      className={`flex shrink-0 items-center gap-1 rounded-t-md border-b-2 px-2 py-1.5 text-[11px] font-bold transition ${
        tab === id ? "border-primary bg-white/5 text-white" : "border-transparent text-white/55 hover:text-white"
      }`}
    >
      <Icon className="h-3 w-3" /> {label}
      {typeof count === "number" && count > 0 && (
        <span className="rounded-full bg-primary/30 px-1.5 text-[10px] tabular-nums text-white">{count}</span>
      )}
    </button>
  );

  return (
    <div className="pointer-events-auto flex max-h-[80vh] w-56 flex-col rounded-2xl bg-gradient-to-b from-black/90 via-black/75 to-black/90 p-2 ring-1 ring-white/15 shadow-[0_10px_36px_-6px_rgba(0,0,0,0.7)] backdrop-blur-xl sm:w-64">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.15em] text-white">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-live opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-live" />
          </span>
          Live Dashboard

        </p>
        <div className="flex items-center gap-1">
          <button onClick={() => setCollapsed((v) => !v)} className="rounded-full p-1 text-white/70 hover:bg-white/10" title={collapsed ? "Expand" : "Collapse"}>
            {collapsed ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
          </button>
          <button onClick={() => setHidden(true)} className="rounded-full p-1 text-white/70 hover:bg-white/10" title="Hide">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>


      <div className={`grid gap-1 ${isFlex ? "grid-cols-3" : "grid-cols-4"}`}>
        {!isFlex && <StatTile icon={DollarSign} label="Gross" value={fmtMoney(stats.grossSales)} accent="ring-emerald-500/20" onClick={() => { setCollapsed(false); setOpenStat("gross"); }} />}
        {!isFlex && <StatTile icon={ShoppingBag} label="Orders" value={String(stats.orderCount)} onClick={() => { setCollapsed(false); setTab("buyers"); }} />}
        <StatTile icon={Users} label="Watching" value={String(livePresenceCount)} accent="ring-primary/20" onClick={() => { setCollapsed(false); setTab("watchers"); }} />
        <StatTile icon={Clock} label="Time" value={fmtElapsed(showTime)} onClick={() => setOpenStat("time")} />
        <StatTile icon={Gift} label="Tips" value={fmtMoney(stats.tipsAndPromo)} accent="ring-purple-500/20" onClick={() => setOpenStat("tips")} />
        <StatTile icon={Share2} label="Shares" value={String(shareCount)} onClick={() => setOpenStat("shares")} />
        <StatTile icon={Bookmark} label="Saves" value={String(stats.bookmarks)} onClick={() => setOpenStat("saves")} />
        <StatTile icon={CreditCard} label="Pending" value={String(stats.pendingPayments)} accent={stats.pendingPayments > 0 ? "ring-rose-500/30" : ""} onClick={() => { setCollapsed(false); setTab("pending"); }} />
      </div>

      {!collapsed && (
        <>
          <div className="mt-1.5 flex gap-0.5 overflow-x-auto border-b border-white/10">
            <TabBtn id="chat" icon={MessageCircle} label="Chat" />
            <TabBtn id="watchers" icon={Users} label={`Watchers`} count={livePresenceCount} />
            <TabBtn id="buyers" icon={ShoppingBag} label="Buyers" count={distinctBuyers.length} />
            <TabBtn id="pending" icon={CreditCard} label="Pending" count={pendingOrders.length} />
            <TabBtn id="winners" icon={Trophy} label="Winners" count={winners.length} />
            <TabBtn id="mods" icon={Shield} label="Mods" count={mods.length} />
            <TabBtn id="activity" icon={Activity} label="Activity" />
          </div>

          <div className="mt-1 flex-1 overflow-y-auto rounded-lg bg-black/40 p-1 ring-1 ring-white/5" style={{ minHeight: 0 }}>
            {tab === "watchers" && (
              livePresenceCount === 0 ? (
                <p className="p-3 text-center text-[11px] text-white/50">No live viewers right now. Share your stream to bring people in.</p>
              ) : (
                viewers.map((v) => {
                  const isMod = mods.some((m) => m.mod_user_id === v.user_id);
                  const isHost = v.user_id === hostId;
                  return (
                    <button
                      key={v.user_id}
                      onClick={() => setOpenUser({ id: v.user_id, username: v.username })}
                      className="flex w-full items-center justify-between rounded px-1.5 py-1 text-left text-[11px] text-white/90 hover:bg-white/5"
                    >
                      <span className="min-w-0 flex-1 truncate font-bold">@{v.username}</span>
                      {isHost && <span className="ml-1 rounded-full bg-primary/30 px-1.5 py-0.5 text-[8px] font-bold uppercase text-primary-foreground">Host</span>}
                      {isMod && !isHost && <span className="ml-1 rounded-full bg-blue-500/30 px-1.5 py-0.5 text-[8px] font-bold uppercase text-blue-200">Mod</span>}
                    </button>
                  );
                })
              )
            )}

            {tab === "buyers" && (
              distinctBuyers.length === 0 ? (
                <p className="p-3 text-center text-[11px] text-white/50">No buyers yet. Start an auction!</p>
              ) : (
                distinctBuyers.map((b) => (
                  <button
                    key={b.buyer_id}
                    onClick={() => {
                      const firstOrder = orders.find((o) => o.buyer_id === b.buyer_id);
                      if (firstOrder) setOpenOrderId(firstOrder.id);
                    }}
                    className="flex w-full items-center justify-between rounded px-1.5 py-1 text-left text-[11px] hover:bg-white/5"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-bold text-primary">@{b.buyer_username}</span>
                      <span className="text-white/60"> · {b.count} item{b.count === 1 ? "" : "s"}</span>
                    </span>
                    <span className="font-bold tabular-nums text-emerald-300">{fmtMoney(b.total)}</span>
                  </button>
                ))
              )
            )}

            {tab === "pending" && (
              pendingOrders.length === 0 ? (
                <p className="p-3 text-center text-[11px] text-white/50">No pending payments. All clear ✅</p>
              ) : (
                pendingOrders.map((o) => {
                  const cls = o.payment_status === "failed" ? "bg-rose-500/30 text-rose-200"
                    : o.payment_status === "processing" ? "bg-amber-500/30 text-amber-200"
                    : "bg-zinc-500/30 text-zinc-200";
                  const lbl = o.payment_status === "failed" ? "🔴 failed"
                    : o.payment_status === "processing" ? "🟡 proc" : "⏳ awaiting";
                  return (
                    <button
                      key={o.id}
                      onClick={() => setOpenOrderId(o.id)}
                      className="flex w-full items-center justify-between gap-1.5 rounded px-1.5 py-1 text-left text-[11px] hover:bg-white/5"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-bold text-primary">@{o.buyer_username}</span>
                        <span className="text-white/70"> · {o.title}</span>
                      </span>
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${cls}`}>{lbl}</span>
                      <span className="font-bold tabular-nums text-emerald-300">{fmtMoney(o.amount)}</span>
                    </button>
                  );
                })
              )
            )}

            {tab === "winners" && (
              winners.length === 0 ? (
                <p className="p-3 text-center text-[11px] text-white/50">No auction wins yet.</p>
              ) : (
                winners.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => setOpenOrderId(o.id)}
                    className="flex w-full items-center justify-between rounded px-1.5 py-1 text-left text-[11px] hover:bg-white/5"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      <Trophy className="mr-1 inline h-2.5 w-2.5 text-yellow-300" />
                      <span className="font-bold text-primary">@{o.buyer_username}</span>
                      <span className="text-white/70"> · {o.title}</span>
                    </span>
                    <span className="font-bold tabular-nums text-emerald-300">{fmtMoney(o.amount)}</span>
                  </button>
                ))
              )
            )}

            {tab === "mods" && (
              <>
                <div className="mb-1 flex gap-1">
                  <input
                    value={addModSearch}
                    onChange={(e) => setAddModSearch(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addModerator(); }}
                    placeholder="@username"
                    className="flex-1 rounded bg-white/5 px-1.5 py-1 text-[11px] text-white placeholder:text-white/30 outline-none ring-1 ring-white/10 focus:ring-primary"
                  />
                  <button onClick={addModerator} className="rounded bg-primary px-2 py-1 text-[10px] font-bold text-primary-foreground hover:bg-primary/90">
                    <UserPlus className="h-3 w-3" />
                  </button>
                </div>
                {mods.length === 0 ? (
                  <p className="p-2 text-center text-[11px] text-white/50">No mods yet. Add one above.</p>
                ) : (
                  mods.map((m) => (
                    <div key={m.mod_user_id} className="flex items-center justify-between rounded px-1.5 py-1 text-[11px] hover:bg-white/5">
                      <span className="font-bold text-white/90">@{m.mod_username}</span>
                      <button
                        onClick={() => removeModerator(m.mod_user_id, m.mod_username)}
                        className="rounded p-1 text-white/50 hover:bg-rose-500/20 hover:text-rose-200"
                        title="Remove mod"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))
                )}
              </>
            )}

            {tab === "activity" && (
              activity.length === 0 ? (
                <p className="p-3 text-center text-[11px] text-white/50">No activity yet.</p>
              ) : (
                activity.map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded px-1.5 py-1 text-[11px] text-white/90">
                    <span className="min-w-0 flex-1 truncate">
                      <span className={`mr-1 ${
                        a.kind === "tip" ? "text-purple-300"
                        : a.kind === "promo" ? "text-orange-300"
                        : a.kind === "mod" ? "text-rose-300"
                        : "text-emerald-300"
                      }`}>
                        {a.kind === "tip" ? "💝" : a.kind === "promo" ? "🔥" : a.kind === "mod" ? "🛡️" : "🛒"}
                      </span>
                      {a.text}
                    </span>
                    {typeof a.amount === "number" && (
                      <span className="ml-2 font-bold tabular-nums text-emerald-300">{fmtMoney(a.amount)}</span>
                    )}
                  </div>
                ))
              )
            )}

            {tab === "chat" && (
              <>
                {(onChangeChatAudience || onChangeSlowMode) && (
                  <div className="sticky top-0 z-10 mb-1 space-y-1 rounded-md bg-black/60 p-1 ring-1 ring-white/10 backdrop-blur">
                    {onChangeChatAudience && chatAudience && (
                      <div className="flex items-center gap-1 text-[9px]">
                        <span className="font-bold uppercase tracking-wider text-white/50">Audience</span>
                        {(["public", "mods_only", "host_mods"] as const).map((a) => (
                          <button key={a} type="button" onClick={() => onChangeChatAudience(a)}
                            className={`rounded-full px-1.5 py-0.5 font-bold uppercase tracking-wider transition ${
                              chatAudience === a
                                ? a === "public" ? "bg-primary text-primary-foreground"
                                  : a === "mods_only" ? "bg-amber-500 text-black"
                                  : "bg-fuchsia-600 text-white"
                                : "bg-white/10 text-white/60 hover:text-white"
                            }`}>
                            {a === "public" ? "All" : a === "mods_only" ? "Mods" : "Host+Mods"}
                          </button>
                        ))}
                      </div>
                    )}
                    {onChangeSlowMode && (
                      <div className="flex items-center gap-1 text-[9px]">
                        <span className="font-bold uppercase tracking-wider text-white/50">Slow</span>
                        {[0, 3, 5, 10, 30].map((s) => (
                          <button key={s} type="button" onClick={() => onChangeSlowMode(s)}
                            className={`rounded-full px-1.5 py-0.5 font-bold transition ${
                              (slowModeSec || 0) === s ? "bg-emerald-500 text-black" : "bg-white/10 text-white/60 hover:text-white"
                            }`}>
                            {s === 0 ? "Off" : `${s}s`}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {chatMessages.length === 0
                  ? <p className="p-2 text-center text-[11px] text-white/40">No chat yet.</p>
                  : (
                    <div className="flex-1 min-h-0 overflow-y-auto space-y-0.5 pr-0.5">
                      {chatMessages.slice(-12).reverse().map((m) => (
                        <div key={m.id} className="truncate rounded px-1.5 py-0.5 text-[11px] text-white/90">
                          <button
                            onClick={() => m.user_id && setOpenUser({ id: m.user_id, username: m.username })}
                            className="font-bold text-primary hover:underline"
                          >@{m.username}:</button> {m.content}
                        </div>
                      ))}
                    </div>
                  )}
              </>
            )}
          </div>
        </>
      )}

      {openOrderId && <BuyerOrderPopover orderId={openOrderId} onClose={() => setOpenOrderId(null)} />}

      {openUser && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm" onClick={() => setOpenUser(null)}>
          <div className="w-full max-w-xs rounded-2xl bg-card p-4 shadow-2xl ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-extrabold">@{openUser.username}</p>
              <button onClick={() => setOpenUser(null)} className="rounded-full p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-1.5">
              <button onClick={() => { applyMod(streamId, openUser.id, openUser.username, "mute"); setOpenUser(null); }}
                className="flex w-full items-center gap-2 rounded-lg bg-amber-500/15 px-3 py-2 text-xs font-bold text-amber-200 ring-1 ring-amber-500/30 hover:bg-amber-500/25">
                <VolumeX className="h-3.5 w-3.5" /> Mute in chat
              </button>
              <button onClick={() => { applyMod(streamId, openUser.id, openUser.username, "timeout", 300); setOpenUser(null); }}
                className="flex w-full items-center gap-2 rounded-lg bg-orange-500/15 px-3 py-2 text-xs font-bold text-orange-200 ring-1 ring-orange-500/30 hover:bg-orange-500/25">
                <Clock4 className="h-3.5 w-3.5" /> Timeout 5 minutes
              </button>
              <button onClick={() => { applyMod(streamId, openUser.id, openUser.username, "ban"); setOpenUser(null); }}
                className="flex w-full items-center gap-2 rounded-lg bg-rose-500/15 px-3 py-2 text-xs font-bold text-rose-200 ring-1 ring-rose-500/30 hover:bg-rose-500/25">
                <Ban className="h-3.5 w-3.5" /> Block from stream
              </button>
              <button onClick={() => { applyMod(streamId, openUser.id, openUser.username, "unmute"); setOpenUser(null); }}
                className="flex w-full items-center gap-2 rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-bold text-emerald-200 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25">
                <UserX className="h-3.5 w-3.5" /> Unmute / Unblock
              </button>
              {!mods.some((m) => m.mod_user_id === openUser.id) && openUser.id !== hostId && (
                <button
                  onClick={async () => {
                    await supabase.from("stream_moderators").insert({
                      stream_id: streamId, mod_user_id: openUser.id, mod_username: openUser.username,
                    } as any);
                    toast.success(`@${openUser.username} promoted to mod`);
                    setOpenUser(null);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg bg-blue-500/15 px-3 py-2 text-xs font-bold text-blue-200 ring-1 ring-blue-500/30 hover:bg-blue-500/25"
                >
                  <Shield className="h-3.5 w-3.5" /> Promote to mod
                </button>
              )}
              <a href={`/seller/${openUser.username}`}
                className="block w-full rounded-lg bg-white/5 px-3 py-2 text-center text-xs font-bold text-white/80 hover:bg-white/10">
                Open profile
              </a>
            </div>
          </div>
        </div>
      )}

      {openStat && (() => {
        const paidOrders = orders.filter((o) => o.payment_status === "paid");
        const tipActs = activity.filter((a) => a.kind === "tip" || a.kind === "promo");
        const cfg: Record<string, { title: string; body: React.ReactNode; action?: { label: string; onClick: () => void } }> = {
          gross: {
            title: "Gross sales",
            body: (
              <div className="space-y-2">
                <div className="rounded-lg bg-emerald-500/10 px-3 py-2 ring-1 ring-emerald-500/30">
                  <p className="text-[10px] uppercase tracking-wider text-emerald-300/80">Total paid</p>
                  <p className="text-xl font-extrabold text-emerald-200">{fmtMoney(stats.grossSales)}</p>
                  <p className="text-[10px] text-white/60">{paidOrders.length} paid order{paidOrders.length === 1 ? "" : "s"}</p>
                </div>
                <div className="max-h-48 space-y-0.5 overflow-y-auto">
                  {paidOrders.length === 0
                    ? <p className="text-center text-[11px] text-white/50">No paid orders yet.</p>
                    : paidOrders.slice(0, 20).map((o) => (
                        <button key={o.id} onClick={() => { setOpenStat(null); setOpenOrderId(o.id); }}
                          className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-[11px] hover:bg-white/5">
                          <span className="min-w-0 flex-1 truncate"><span className="font-bold text-primary">@{o.buyer_username}</span> · {o.title}</span>
                          <span className="font-bold tabular-nums text-emerald-300">{fmtMoney(o.amount)}</span>
                        </button>
                      ))}
                </div>
              </div>
            ),
          },
          time: {
            title: "Show time",
            body: (
              <div className="space-y-2 text-[12px]">
                <div className="rounded-lg bg-white/5 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-white/50">Elapsed</p>
                  <p className="text-xl font-extrabold text-white">{fmtElapsed(showTime)}</p>
                </div>
                <p className="text-white/70">Started: <span className="font-bold text-white">{startedAt ? new Date(startedAt).toLocaleString() : "—"}</span></p>
                <p className="text-white/60">Currently watching: <span className="font-bold text-white">{livePresenceCount}</span></p>
              </div>
            ),
          },
          tips: {
            title: "Tips + Promos",
            body: (
              <div className="space-y-2">
                <div className="rounded-lg bg-purple-500/10 px-3 py-2 ring-1 ring-purple-500/30">
                  <p className="text-[10px] uppercase tracking-wider text-purple-300/80">Total</p>
                  <p className="text-xl font-extrabold text-purple-200">{fmtMoney(stats.tipsAndPromo)}</p>
                </div>
                <div className="max-h-48 space-y-0.5 overflow-y-auto">
                  {tipActs.length === 0
                    ? <p className="text-center text-[11px] text-white/50">No tips or promos yet.</p>
                    : tipActs.slice(0, 30).map((a) => (
                        <div key={a.id} className="flex items-center justify-between rounded px-2 py-1 text-[11px] text-white/90">
                          <span className="min-w-0 flex-1 truncate">{a.kind === "tip" ? "💝" : "🔥"} {a.text}</span>
                          {typeof a.amount === "number" && <span className="font-bold tabular-nums text-purple-300">{fmtMoney(a.amount)}</span>}
                        </div>
                      ))}
                </div>
              </div>
            ),
          },
          shares: {
            title: "Shares",
            body: (
              <div className="space-y-2 text-[12px]">
                <div className="rounded-lg bg-white/5 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-white/50">Total shares</p>
                  <p className="text-xl font-extrabold text-white">{shareCount}</p>
                </div>
                <p className="text-white/60">Viewers who shared this stream out (links, social, copy-link). Higher share count = more discovery.</p>
                <button
                  onClick={async () => {
                    const url = `${window.location.origin}/live/${streamId}`;
                    try {
                      if (navigator.share) await navigator.share({ url, title: "Watch live" });
                      else { await navigator.clipboard.writeText(url); toast.success("Link copied"); }
                    } catch {}
                  }}
                  className="w-full rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90"
                >Share stream link</button>
              </div>
            ),
          },
          saves: {
            title: "Saves / Bookmarks",
            body: (
              <div className="space-y-2 text-[12px]">
                <div className="rounded-lg bg-white/5 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-white/50">Bookmarks</p>
                  <p className="text-xl font-extrabold text-white">{stats.bookmarks}</p>
                </div>
                <p className="text-white/60">
                  {scheduledShowId
                    ? "Users who bookmarked this scheduled show. They'll get a reminder when you go live."
                    : "Bookmarks are tracked for scheduled shows. Schedule a show ahead of time to grow this number."}
                </p>
              </div>
            ),
          },
        };
        const c = cfg[openStat];
        return (
          <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm" onClick={() => setOpenStat(null)}>
            <div className="w-full max-w-xs rounded-2xl bg-card p-4 shadow-2xl ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-extrabold">{c.title}</p>
                <button onClick={() => setOpenStat(null)} className="rounded-full p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
              </div>
              {c.body}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
