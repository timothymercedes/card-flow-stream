import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { Radio, Calendar, Plus, X, Trash2, Users, Filter, Share2 } from "lucide-react";
import { toast } from "sonner";
import { LISTING_CATEGORIES, categoryEmoji, categoryLabel } from "@/lib/listingCategories";
import { STREAM_TYPES, TCG_TAGS, tcgTagMeta } from "@/lib/streamTaxonomy";
import { SellerBadge } from "@/components/SellerBadge";
import { WatchTutorial } from "@/components/WatchTutorial";
import { useRealtimeChannel } from "@/lib/realtime";
import { ShareLiveModal } from "@/components/ShareLiveModal";
import { BookmarkButton } from "@/components/BookmarkButton";
import { InternationalBadge } from "@/components/InternationalBadge";

export const Route = createFileRoute("/live/")({ component: LiveList });

type Stream = { id: string; title: string; thumbnail_url: string | null; current_bid: number; ends_at: string | null; category: string | null; seller_id: string; stream_type?: string | null; tcg_tags?: string[] | null; ships_internationally?: boolean | null };
type Show = {
  id: string; seller_id: string; seller_username: string; title: string;
  description: string | null; thumbnail_url: string | null; category: string | null;
  scheduled_for: string;
};

type ViewerBucket = "any" | "intimate" | "warm" | "hot";

function fmtCountdown(target: string) {
  const ms = new Date(target).getTime() - Date.now();
  if (ms <= 0) return "Starting…";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function StreamCountdown({ endsAt }: { endsAt: string }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, []);
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return <span className="text-destructive">Ended</span>;
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return <span>{m}:{sec.toString().padStart(2, "0")}</span>;
}

function LiveList() {
  const { user, profile } = useAuth();
  const [tab, setTab] = useState<"live" | "scheduled">("live");
  const [streams, setStreams] = useState<Stream[]>([]);
  const [viewerCounts, setViewerCounts] = useState<Record<string, number>>({});
  const [shows, setShows] = useState<Show[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", category: "", thumbnail_url: "", date: "", time: "" });
  const [recurring, setRecurring] = useState(false);
  const [weeks, setWeeks] = useState("4");
  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const [days, setDays] = useState<number[]>([]);
  // Filters
  const [catFilter, setCatFilter] = useState<string>("all");
  const [tcgFilter, setTcgFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [viewerBucket, setViewerBucket] = useState<ViewerBucket>("any");
  const [shareTarget, setShareTarget] = useState<Stream | null>(null);

  async function load() {
    const [{ data: s }, { data: sh }] = await Promise.all([
      supabase.from("live_streams").select("*").eq("status", "live").neq("mode", "show_off").order("promotion_score", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("scheduled_shows").select("*").gte("scheduled_for", new Date().toISOString()).order("scheduled_for", { ascending: true }),
    ]);
    setStreams((s as Stream[]) || []);
    setShows((sh as Show[]) || []);

    // Viewer counts: presence rows seen in last 90s
    const cutoff = new Date(Date.now() - 90_000).toISOString();
    const { data: pres } = await supabase
      .from("live_stream_presence")
      .select("stream_id")
      .gte("last_seen_at", cutoff);
    const counts: Record<string, number> = {};
    (pres || []).forEach((r: any) => { counts[r.stream_id] = (counts[r.stream_id] || 0) + 1; });
    setViewerCounts(counts);
  }

  // Categories actually present in current live streams (so the filter only shows useful options)
  const activeCategories = useMemo(() => {
    const set = new Set<string>();
    streams.forEach((s) => { if (s.category) set.add(s.category); });
    return Array.from(set);
  }, [streams]);

  const filteredStreams = useMemo(() => {
    return streams.filter((s) => {
      if (catFilter !== "all" && s.category !== catFilter) return false;
      if (typeFilter !== "all" && (s.stream_type || "auction") !== typeFilter) return false;
      if (tcgFilter !== "all" && !(s.tcg_tags || []).includes(tcgFilter)) return false;
      const v = viewerCounts[s.id] || 0;
      if (viewerBucket === "intimate" && v > 10) return false;
      if (viewerBucket === "warm" && (v < 11 || v > 50)) return false;
      if (viewerBucket === "hot" && v < 51) return false;
      return true;
    });
  }, [streams, catFilter, typeFilter, tcgFilter, viewerBucket, viewerCounts]);

  useEffect(() => { load(); }, []);
  useRealtimeChannel({ name: "live-shows" }, (ch) => ch
    .on("postgres_changes" as any, { event: "*", schema: "public", table: "scheduled_shows" } as any, () => load())
    .on("postgres_changes" as any, { event: "*", schema: "public", table: "live_streams" } as any, () => load()));

  async function createShow() {
    if (!user || !profile) return toast.error("Sign in first");
    if (!form.title || !form.date || !form.time) return toast.error("Title, date and time required");
    const base = new Date(`${form.date}T${form.time}`);
    if (base.getTime() < Date.now()) return toast.error("Pick a future date");

    const dates: Date[] = [];
    if (recurring) {
      const w = Math.max(1, Math.min(12, Number(weeks) || 4));
      const selected = days.length ? days : [base.getDay()];
      for (let i = 0; i < w; i++) {
        for (const dow of selected) {
          const d = new Date(base);
          d.setDate(base.getDate() + i * 7 + ((dow - base.getDay() + 7) % 7));
          if (d.getTime() > Date.now()) dates.push(d);
        }
      }
    } else {
      dates.push(base);
    }

    const rows = dates.map((d) => ({
      seller_id: user.id,
      seller_username: profile.username,
      title: form.title,
      description: form.description || null,
      category: form.category || null,
      thumbnail_url: form.thumbnail_url || null,
      scheduled_for: d.toISOString(),
    }));
    const { error } = await supabase.from("scheduled_shows").insert(rows);
    if (error) return toast.error(error.message);
    toast.success(rows.length === 1 ? "Show scheduled" : `${rows.length} shows scheduled`);
    setComposeOpen(false);
    setForm({ title: "", description: "", category: "", thumbnail_url: "", date: "", time: "" });
    setRecurring(false); setDays([]); setWeeks("4");
    load();
  }

  async function deleteShow(id: string) {
    if (!confirm("Cancel this show?")) return;
    await supabase.from("scheduled_shows").delete().eq("id", id);
    load();
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-7xl px-4 py-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Live</h1>
            <p className="text-xs text-muted-foreground">
              {streams.length} streaming now • {shows.length} upcoming
            </p>
          </div>
          <div className="flex items-center gap-2">
            <WatchTutorial routePath="/live" label="Watch tutorial" />
            {tab === "scheduled" && user && (
              <button onClick={() => setComposeOpen(true)} className="flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-[var(--shadow-primary)] transition active:scale-[0.98]">
                <Plus className="h-3.5 w-3.5" /> Schedule
              </button>
            )}
          </div>
        </div>

        <div className="mb-4 flex gap-2 border-b border-border/60">
          <button onClick={() => setTab("live")} className={`flex items-center gap-1 border-b-2 px-3 py-2 text-sm transition-colors ${tab === "live" ? "border-primary font-bold text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <Radio className="h-3.5 w-3.5" /> Live now
          </button>
          <button onClick={() => setTab("scheduled")} className={`flex items-center gap-1 border-b-2 px-3 py-2 text-sm transition-colors ${tab === "scheduled" ? "border-primary font-bold text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <Calendar className="h-3.5 w-3.5" /> Scheduled
          </button>
        </div>

        {tab === "live" && (
          <>
            {/* Sticky filter bar */}
            <div className="sticky top-0 z-20 -mx-4 mb-3 space-y-2 border-b border-border/60 bg-background/85 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/70">
              <div className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                <Filter className="h-3 w-3" /> Pick what you're into
              </div>
              <div className="flex flex-col gap-2 lg:flex-row">
                <select
                  value={catFilter}
                  onChange={(e) => setCatFilter(e.target.value)}
                  className={`w-full rounded-full px-3 py-1.5 text-[11px] font-bold ring-1 ring-border/60 outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${catFilter !== "all" ? "bg-primary text-primary-foreground" : "bg-card/60"}`}
                >
                  <option value="all">✨ All categories</option>
                  {LISTING_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.emoji} {c.label}</option>
                  ))}
                </select>
                <div className="flex gap-1.5">
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className={`flex-1 rounded-full px-3 py-1.5 text-[11px] font-bold ring-1 ring-border/60 outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${typeFilter !== "all" ? "bg-primary text-primary-foreground" : "bg-card/60"}`}
                  >
                    <option value="all">All types</option>
                    {STREAM_TYPES.map((s) => (
                      <option key={s.value} value={s.value}>{s.emoji} {s.label}</option>
                    ))}
                  </select>
                  <select
                    value={tcgFilter}
                    onChange={(e) => setTcgFilter(e.target.value)}
                    className={`flex-1 rounded-full px-3 py-1.5 text-[11px] font-bold ring-1 ring-border/60 outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${tcgFilter !== "all" ? "bg-primary text-primary-foreground" : "bg-card/60"}`}
                  >
                    <option value="all">All TCGs</option>
                    {TCG_TAGS.map((t) => (
                      <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-1.5">
                {([
                  { v: "any", label: "Any size" },
                  { v: "intimate", label: "🤝 Cozy ≤10" },
                  { v: "warm", label: "🔥 Warm 11–50" },
                  { v: "hot", label: "🚀 Packed 50+" },
                ] as { v: ViewerBucket; label: string }[]).map((b) => (
                  <button key={b.v} onClick={() => setViewerBucket(b.v)} className={`flex-1 rounded-full px-2 py-1 text-[10px] font-bold transition ${viewerBucket === b.v ? "bg-primary text-primary-foreground shadow-[var(--shadow-primary)]" : "bg-card/60 ring-1 ring-border/60 hover:bg-card"}`}>
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredStreams.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 py-12 text-center">
                <Radio className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm font-semibold">
                  {streams.length === 0 ? "No active streams yet" : "No streams match these filters"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {streams.length === 0 ? "Be the first to go live!" : "Try widening your picks."}
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {filteredStreams.map((s) => (
                <div key={s.id} className="min-w-0 group">
                  <Link to="/live/$id" params={{ id: s.id }} className="block">
                    <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-muted ring-1 ring-border/60 shadow-[var(--shadow-card)] transition group-hover:-translate-y-0.5 group-hover:shadow-[var(--shadow-lg)] group-hover:ring-primary/50">
                      {s.thumbnail_url ? <img src={s.thumbnail_url} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" alt={s.title} /> : <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/30 to-live/30"><Radio className="h-10 w-10" /></div>}
                      <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-live px-2 py-0.5 text-[10px] font-bold text-live-foreground shadow-[var(--shadow-sm)]">
                        <span className="h-1.5 w-1.5 live-pulse rounded-full bg-live-foreground" /> LIVE
                      </div>
                      <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold tabular-nums text-white backdrop-blur">
                        <Users className="h-2.5 w-2.5" />{viewerCounts[s.id] || 0}
                      </div>
                      {s.category && (
                        <div className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur">
                          {categoryEmoji(s.category)} {categoryLabel(s.category)}
                        </div>
                      )}
                      {s.ends_at && (
                        <div className="absolute bottom-9 right-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold tabular-nums text-white backdrop-blur">
                          <StreamCountdown endsAt={s.ends_at} />
                        </div>
                      )}
                    </div>
                    <p className="mt-2 line-clamp-1 text-sm font-semibold">{s.title}</p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <SellerBadge sellerId={s.seller_id} linkable={false} />
                      <InternationalBadge enabled={s.ships_internationally} />
                    </div>
                    {Number(s.current_bid) > 0 && <p className="text-xs font-bold text-primary">${Number(s.current_bid).toFixed(0)}</p>}
                    {Array.isArray(s.tcg_tags) && s.tcg_tags.length > 0 && (
                      <p className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground">
                        {s.tcg_tags.slice(0, 3).map((t) => `${tcgTagMeta(t)?.emoji ?? ""} ${tcgTagMeta(t)?.label ?? t}`).join(" · ")}
                      </p>
                    )}
                  </Link>
                  <button
                    onClick={() => setShareTarget(s)}
                    className="mt-1 inline-flex items-center gap-1 rounded-full bg-card/60 px-2 py-1 text-[10px] font-bold text-muted-foreground ring-1 ring-border/60 transition hover:bg-card hover:text-foreground"
                    aria-label="Share live"
                  >
                    <Share2 className="h-3 w-3" /> Share
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-3 text-center text-[10px] text-muted-foreground">💡 Tip: inside a stream, swipe left/right to jump to the next live show.</p>
          </>
        )}


        {tab === "scheduled" && (
          <>
            {shows.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">No upcoming shows. Tap Schedule to plan one.</p>}
            <div className="space-y-3">
              {shows.map((sh) => (
                <div key={sh.id} className="flex gap-3 rounded-xl bg-card p-3">
                  <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
                    {sh.thumbnail_url ? <img src={sh.thumbnail_url} className="h-full w-full object-cover" alt="" /> : <div className="flex h-full w-full items-center justify-center"><Calendar className="h-6 w-6 text-muted-foreground" /></div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-1 text-sm font-bold">{sh.title}</p>
                      {user?.id === sh.seller_id && (
                        <button onClick={() => deleteShow(sh.id)} className="rounded-full p-1 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                      )}
                    </div>
                    <div className="mt-0.5"><SellerBadge sellerId={sh.seller_id} username={sh.seller_username} linkable={true} /></div>
                    {sh.category && <p className="text-[10px] text-muted-foreground">{categoryEmoji(sh.category)} {categoryLabel(sh.category) || sh.category}</p>}
                    {sh.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{sh.description}</p>}
                    <p className="mt-1 text-xs">
                      {new Date(sh.scheduled_for).toLocaleString()}
                      <span className="ml-2 rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">in {fmtCountdown(sh.scheduled_for)}</span>
                    </p>
                    <div className="mt-2"><BookmarkButton showId={sh.id} /></div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {composeOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={() => setComposeOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md space-y-2 rounded-2xl bg-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-bold">Schedule a show</p>
              <button onClick={() => setComposeOpen(false)}><X className="h-4 w-4" /></button>
            </div>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" className="w-full rounded-lg bg-input px-3 py-2 text-sm outline-none" />
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description (optional)" rows={2} className="w-full resize-none rounded-lg bg-input px-3 py-2 text-sm outline-none" />
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full rounded-lg bg-input px-3 py-2 text-sm outline-none">
              <option value="">Pick a category…</option>
              {LISTING_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.emoji} {c.label}</option>)}
            </select>
            <input value={form.thumbnail_url} onChange={(e) => setForm({ ...form, thumbnail_url: e.target.value })} placeholder="Thumbnail URL (optional)" className="w-full rounded-lg bg-input px-3 py-2 text-sm outline-none" />
            <div className="flex gap-2">
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="flex-1 rounded-lg bg-input px-3 py-2 text-sm outline-none" />
              <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className="flex-1 rounded-lg bg-input px-3 py-2 text-sm outline-none" />
            </div>

            <label className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs">
              <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
              <span className="font-semibold">Repeat weekly</span>
              <span className="text-muted-foreground">(uses the time above)</span>
            </label>
            {recurring && (
              <div className="space-y-2 rounded-lg bg-muted/30 p-2">
                <p className="text-[11px] text-muted-foreground">Days of the week</p>
                <div className="flex flex-wrap gap-1">
                  {WEEKDAYS.map((d, i) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDays((cur) => cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i])}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${days.includes(i) ? "bg-primary text-primary-foreground" : "bg-card"}`}
                    >{d}</button>
                  ))}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span>For</span>
                  <input type="number" min={1} max={12} value={weeks} onChange={(e) => setWeeks(e.target.value)} className="w-16 rounded-lg bg-input px-2 py-1 text-xs outline-none" />
                  <span>weeks</span>
                </div>
                <p className="text-[10px] text-muted-foreground">Tip: leave days empty to repeat on the same weekday as the start date.</p>
              </div>
            )}
            <button onClick={createShow} className="w-full rounded-lg bg-primary py-2 text-sm font-bold text-primary-foreground">
              {recurring ? "Schedule recurring shows" : "Schedule"}
            </button>
          </div>
        </div>
      )}

      <ShareLiveModal
        open={!!shareTarget}
        onClose={() => setShareTarget(null)}
        streamId={shareTarget?.id || ""}
        title={shareTarget?.title || ""}
        thumbnailUrl={shareTarget?.thumbnail_url}
        isLive={true}
      />
    </AppShell>
  );
}
