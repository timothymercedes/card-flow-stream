import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  DollarSign, ShoppingBag, Clock, Gift, Share2, Bookmark, X, Minimize2, Maximize2,
  MessageCircle, Users, Activity, HelpCircle, Shield, VolumeX, Trophy, CreditCard,
} from "lucide-react";

type Stats = {
  grossSales: number;
  orderCount: number;
  tipsAndPromo: number;
  pendingPayments: number;
  bookmarks: number;
};

type ActivityRow = {
  id: string;
  kind: "order" | "tip" | "promo" | "follow" | "ban" | "mute";
  who: string;
  amount?: number;
  text: string;
  at: string;
};

type WatcherRow = { user_id: string; username: string; role: "buyer" | "mod" | "muted" | "host" };
type ChatMsg = { id: string; user_id: string | null; username: string; content: string; created_at: string };

type Filter = "questions" | "buyers" | "mods" | "muted" | "winners" | "pending";

function fmtMoney(n: number) {
  return `$${(Number(n) || 0).toFixed(0)}`;
}
function fmtElapsed(ms: number) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}:${sec.toString().padStart(2, "0")}`;
}

export function LiveSellerDashboard({
  streamId,
  hostId,
  startedAt,
  viewerCount,
  chatMessages,
  scheduledShowId,
  isFlex = false,
}: {
  streamId: string;
  hostId: string;
  startedAt: string | null;
  viewerCount: number;
  chatMessages: ChatMsg[];
  scheduledShowId?: string | null;
  isFlex?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [tab, setTab] = useState<"chat" | "watching" | "activity">("activity");
  const [filter, setFilter] = useState<Filter | null>(null);

  const [stats, setStats] = useState<Stats>({
    grossSales: 0, orderCount: 0, tipsAndPromo: 0, pendingPayments: 0, bookmarks: 0,
  });
  const [shareCount, setShareCount] = useState<number>(0);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [watchers, setWatchers] = useState<WatcherRow[]>([]);
  const [, setTick] = useState(0);

  // tick clock for show time
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, []);

  // load + subscribe to all the data we need
  useEffect(() => {
    let cancelled = false;
    async function loadAll() {
      const [
        ordersRes, tipsRes, promoRes, modsRes, bansRes, mutesRes, bookmarksRes,
      ] = await Promise.all([
        supabase.from("orders").select("id, buyer_id, title, amount, payment_status, created_at").eq("stream_id", streamId).order("created_at", { ascending: false }),
        supabase.from("stream_tips").select("id, buyer_id, buyer_username, amount, status, created_at").eq("stream_id", streamId).order("created_at", { ascending: false }),
        supabase.from("stream_promotions").select("id, promoter_id, promoter_username, amount, status, created_at").eq("stream_id", streamId).order("created_at", { ascending: false }),
        supabase.from("stream_moderators").select("mod_user_id, mod_username").eq("stream_id", streamId),
        supabase.from("stream_user_bans").select("banned_user_id").eq("stream_id", streamId),
        supabase.from("stream_chat_actions").select("target_user_id, target_username, action, expires_at, created_at").eq("stream_id", streamId).order("created_at", { ascending: false }),
        scheduledShowId
          ? supabase.from("show_bookmarks" as any).select("id", { count: "exact", head: true }).eq("show_id", scheduledShowId)
          : Promise.resolve({ count: 0 } as any),
      ]);
      if (cancelled) return;

      const orders = ordersRes.data || [];
      const tips = (tipsRes.data || []).filter((t: any) => t.status === "paid");
      const promos = (promoRes.data || []).filter((p: any) => p.status === "paid");
      const paidOrders = orders.filter((o: any) => o.payment_status === "paid");
      const pendingOrders = orders.filter((o: any) => o.payment_status !== "paid");

      const grossSales = paidOrders.reduce((s: number, o: any) => s + Number(o.amount || 0), 0);
      const tipsAndPromo =
        tips.reduce((s: number, t: any) => s + Number(t.amount || 0), 0) +
        promos.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);

      setStats({
        grossSales,
        orderCount: orders.length,
        tipsAndPromo,
        pendingPayments: pendingOrders.length,
        bookmarks: (bookmarksRes as any)?.count || 0,
      });

      // Derive watcher roles from mods/bans/mutes
      const modMap = new Map<string, string>();
      (modsRes.data || []).forEach((m: any) => modMap.set(m.mod_user_id, m.mod_username));
      const mutedMap = new Map<string, string>();
      const seenAction = new Set<string>();
      (mutesRes.data || []).forEach((a: any) => {
        if (seenAction.has(a.target_user_id)) return;
        seenAction.add(a.target_user_id);
        if (["mute", "timeout", "ban"].includes(a.action)) {
          const stillActive = !a.expires_at || new Date(a.expires_at).getTime() > Date.now();
          if (stillActive) mutedMap.set(a.target_user_id, a.target_username);
        }
      });
      const buyerMap = new Map<string, string>();
      orders.forEach((o: any) => buyerMap.set(o.buyer_id, ""));
      // fill buyer usernames best-effort
      if (buyerMap.size > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, username")
          .in("user_id", Array.from(buyerMap.keys()));
        (profs || []).forEach((p: any) => buyerMap.set(p.user_id, p.username));
      }

      const w: WatcherRow[] = [];
      modMap.forEach((u, id) => w.push({ user_id: id, username: u, role: "mod" }));
      mutedMap.forEach((u, id) => {
        if (!modMap.has(id)) w.push({ user_id: id, username: u, role: "muted" });
      });
      buyerMap.forEach((u, id) => {
        if (!modMap.has(id) && !mutedMap.has(id)) w.push({ user_id: id, username: u || "buyer", role: "buyer" });
      });
      setWatchers(w);

      // activity feed
      const acts: ActivityRow[] = [];
      paidOrders.slice(0, 12).forEach((o: any) =>
        acts.push({
          id: `o-${o.id}`, kind: "order", who: o.title,
          amount: Number(o.amount), text: `Order paid · ${o.title}`,
          at: o.created_at,
        })
      );
      tips.slice(0, 8).forEach((t: any) =>
        acts.push({
          id: `t-${t.id}`, kind: "tip", who: t.buyer_username,
          amount: Number(t.amount), text: `Tip from @${t.buyer_username}`,
          at: t.created_at,
        })
      );
      promos.slice(0, 8).forEach((p: any) =>
        acts.push({
          id: `p-${p.id}`, kind: "promo", who: p.promoter_username,
          amount: Number(p.amount), text: `Promo from @${p.promoter_username}`,
          at: p.created_at,
        })
      );
      acts.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      setActivity(acts.slice(0, 30));
    }
    loadAll();
    const ch = supabase
      .channel(`dash-${streamId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `stream_id=eq.${streamId}` }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "stream_tips", filter: `stream_id=eq.${streamId}` }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "stream_promotions", filter: `stream_id=eq.${streamId}` }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "stream_chat_actions", filter: `stream_id=eq.${streamId}` }, loadAll)
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [streamId, scheduledShowId]);

  // Local share tracking (best-effort; we listen for window event from ShareLiveModal callers)
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

  const questionMessages = useMemo(
    () => chatMessages.filter((m) => m.content.includes("?")).slice(-20).reverse(),
    [chatMessages]
  );

  const filteredWatchers = useMemo(() => {
    if (filter === "buyers") return watchers.filter((w) => w.role === "buyer");
    if (filter === "mods") return watchers.filter((w) => w.role === "mod");
    if (filter === "muted") return watchers.filter((w) => w.role === "muted");
    return watchers;
  }, [watchers, filter]);

  if (hidden) {
    return (
      <button
        onClick={() => setHidden(false)}
        className="pointer-events-auto flex items-center gap-1 rounded-l-lg bg-primary/90 px-2 py-2 text-[10px] font-bold text-primary-foreground shadow-lg backdrop-blur"
        title="Open Seller Dashboard"
      >
        <span className="text-xs">📊</span>
        <span className="hidden md:inline">Dashboard</span>
      </button>
    );
  }

  const StatTile = ({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string; accent?: string }) => (
    <div className={`flex min-w-0 flex-1 flex-col rounded-md bg-black/55 px-1.5 py-1 ring-1 ring-white/10 backdrop-blur ${accent || ""}`}>
      <div className="flex items-center gap-0.5 text-[8px] font-semibold uppercase tracking-wider text-white/60">
        <Icon className="h-2 w-2" /> {label}
      </div>
      <div className="truncate text-xs font-extrabold tabular-nums text-white">{value}</div>
    </div>
  );

  const FilterChip = ({ id, icon: Icon, label, count }: { id: Filter; icon: any; label: string; count?: number }) => (
    <button
      onClick={() => setFilter(filter === id ? null : id)}
      className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${
        filter === id
          ? "bg-primary text-primary-foreground ring-primary"
          : "bg-black/50 text-white/80 ring-white/10 hover:bg-black/70"
      }`}
    >
      <Icon className="h-2.5 w-2.5" /> {label}
      {typeof count === "number" && count > 0 && (
        <span className="rounded-full bg-white/20 px-1 text-[9px]">{count}</span>
      )}
    </button>
  );

  return (
    <div className="pointer-events-auto w-56 rounded-xl bg-black/70 p-1.5 ring-1 ring-white/10 shadow-xl backdrop-blur">
      <div className="mb-1 flex items-center justify-between">
        <p className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-white">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-live" /> Dashboard
        </p>
        <div className="flex items-center gap-0.5">
          <button onClick={() => setCollapsed((v) => !v)} className="rounded-full p-0.5 text-white/70 hover:bg-white/10" title={collapsed ? "Expand" : "Collapse"}>
            {collapsed ? <Maximize2 className="h-2.5 w-2.5" /> : <Minimize2 className="h-2.5 w-2.5" />}
          </button>
          <button onClick={() => setHidden(true)} className="rounded-full p-0.5 text-white/70 hover:bg-white/10" title="Hide">
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1">
        <StatTile icon={DollarSign} label="Gross" value={fmtMoney(stats.grossSales)} accent="ring-emerald-500/20" />
        <StatTile icon={ShoppingBag} label="Orders" value={String(stats.orderCount)} />
        <StatTile icon={Clock} label="Show time" value={fmtElapsed(showTime)} />
        <StatTile icon={Gift} label="Tips+Promo" value={fmtMoney(stats.tipsAndPromo)} accent="ring-purple-500/20" />
        <StatTile icon={Share2} label="Shares" value={String(shareCount)} />
        <StatTile icon={Bookmark} label="Bookmarks" value={String(stats.bookmarks)} />
      </div>

      {!collapsed && (
        <>
          <div className="mt-1.5 flex gap-0.5 border-b border-white/10">
            {([
              { v: "chat", label: "Chat", icon: MessageCircle },
              { v: "watching", label: `Watching ${viewerCount}`, icon: Users },
              { v: "activity", label: "Activity", icon: Activity },
            ] as const).map((t) => (
              <button
                key={t.v}
                onClick={() => setTab(t.v)}
                className={`flex items-center gap-0.5 border-b-2 px-1.5 py-0.5 text-[10px] font-bold ${
                  tab === t.v ? "border-primary text-primary" : "border-transparent text-white/60"
                }`}
              >
                <t.icon className="h-2.5 w-2.5" /> {t.label}
              </button>
            ))}
          </div>

          <div className="mt-1 flex gap-0.5 overflow-x-auto pb-0.5">
            <FilterChip id="questions" icon={HelpCircle} label="Q" count={questionMessages.length} />
            <FilterChip id="buyers" icon={ShoppingBag} label="Buyers" count={watchers.filter((w) => w.role === "buyer").length} />
            <FilterChip id="mods" icon={Shield} label="Mods" count={watchers.filter((w) => w.role === "mod").length} />
            <FilterChip id="muted" icon={VolumeX} label="Muted" count={watchers.filter((w) => w.role === "muted").length} />
            <FilterChip id="winners" icon={Trophy} label="Winners" />
            <FilterChip id="pending" icon={CreditCard} label="Pending" count={stats.pendingPayments} />
          </div>

          <div className="mt-0.5 max-h-36 overflow-y-auto rounded-lg bg-black/40 p-1 ring-1 ring-white/5">
            {tab === "chat" && (
              <>
                {(filter === "questions" ? questionMessages : chatMessages.slice(-30).reverse()).map((m) => (
                  <div key={m.id} className="rounded px-1.5 py-0.5 text-[11px] text-white/90">
                    <span className="font-bold text-primary">@{m.username}:</span> {m.content}
                  </div>
                ))}
                {chatMessages.length === 0 && <p className="p-2 text-center text-[11px] text-white/40">No chat yet.</p>}
              </>
            )}
            {tab === "watching" && (
              <>
                {filteredWatchers.length === 0 && <p className="p-2 text-center text-[11px] text-white/40">No watchers in this slice.</p>}
                {filteredWatchers.map((w) => (
                  <div key={w.user_id} className="flex items-center justify-between rounded px-1.5 py-0.5 text-[11px]">
                    <span className="font-bold text-white/90">@{w.username || "user"}</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                      w.role === "mod" ? "bg-blue-500/30 text-blue-200" :
                      w.role === "muted" ? "bg-red-500/30 text-red-200" :
                      "bg-emerald-500/30 text-emerald-200"
                    }`}>{w.role}</span>
                  </div>
                ))}
              </>
            )}
            {tab === "activity" && (
              <>
                {activity.length === 0 && <p className="p-2 text-center text-[11px] text-white/40">No activity yet.</p>}
                {(filter === "pending"
                  ? activity.filter((a) => a.kind === "order")
                  : activity
                ).map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded px-1.5 py-0.5 text-[11px] text-white/90">
                    <span className="truncate">
                      <span className={`mr-1 ${a.kind === "tip" ? "text-purple-300" : a.kind === "promo" ? "text-orange-300" : "text-emerald-300"}`}>
                        {a.kind === "tip" ? "💝" : a.kind === "promo" ? "🔥" : "🛒"}
                      </span>
                      {a.text}
                    </span>
                    {typeof a.amount === "number" && (
                      <span className="ml-2 font-bold tabular-nums text-emerald-300">{fmtMoney(a.amount)}</span>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
