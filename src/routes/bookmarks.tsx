/**
 * /bookmarks — saved upcoming shows + reminder preferences for the current user.
 */
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { BookmarkButton } from "@/components/BookmarkButton";
import { Bell, Calendar, Clock, Moon } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/bookmarks")({ component: BookmarksPage });

type Row = {
  id: string;
  show_id: string;
  notify_push: boolean;
  notify_inapp: boolean;
  notify_email: boolean;
  scheduled_shows: {
    id: string;
    title: string;
    scheduled_for: string;
    seller_username: string;
    thumbnail_url: string | null;
    category: string | null;
  } | null;
};

function fmt(dt: string) {
  const d = new Date(dt);
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function timeLeft(dt: string) {
  const ms = new Date(dt).getTime() - Date.now();
  if (ms < 0) return "started";
  const h = Math.floor(ms / 3600_000);
  if (h >= 24) return `in ${Math.round(h / 24)}d`;
  if (h >= 1) return `in ${h}h`;
  return `in ${Math.max(1, Math.round(ms / 60000))}m`;
}

function BookmarksPage() {
  const { user, profile, loading } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(true);
  const [tz, setTz] = useState(profile?.["timezone" as keyof typeof profile] as any || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [qStart, setQStart] = useState<number | "">((profile as any)?.notify_quiet_start ?? "");
  const [qEnd, setQEnd] = useState<number | "">((profile as any)?.notify_quiet_end ?? "");

  useEffect(() => {
    if (!loading && !user) throw redirect({ to: "/auth", search: { returnTo: "/bookmarks" } as any });
  }, [user, loading]);

  useEffect(() => {
    if (!user) return;
    setBusy(true);
    supabase
      .from("show_bookmarks" as any)
      .select("id, show_id, notify_push, notify_inapp, notify_email, scheduled_shows(id,title,scheduled_for,seller_username,thumbnail_url,category)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        const list = ((data as any) || []) as Row[];
        // Hide past shows
        list.sort((a, b) => new Date(a.scheduled_shows?.scheduled_for || 0).getTime() - new Date(b.scheduled_shows?.scheduled_for || 0).getTime());
        setRows(list.filter((r) => r.scheduled_shows && new Date(r.scheduled_shows.scheduled_for).getTime() > Date.now() - 3600_000));
        setBusy(false);
      });
  }, [user?.id]);

  async function savePrefs() {
    if (!user) return;
    const { error } = await supabase.from("profiles").update({
      timezone: tz,
      notify_quiet_start: qStart === "" ? null : Number(qStart),
      notify_quiet_end: qEnd === "" ? null : Number(qEnd),
    } as any).eq("id", user.id);
    if (error) toast.error(error.message);
    else toast.success("Saved reminder preferences");
  }

  if (loading) return null;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-2xl space-y-5 p-4">
        <header>
          <h1 className="text-2xl font-black tracking-tight">My Bookmarks</h1>
          <p className="text-sm text-muted-foreground">Upcoming shows you've saved. We'll remind you 24h and 1h before each one goes live.</p>
        </header>

        {/* Reminder preferences */}
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold"><Moon className="h-4 w-4" /> Quiet hours</h2>
          <p className="mt-1 text-xs text-muted-foreground">Push and email reminders are silenced during this window. The in-app bell still drops a notification.</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted-foreground">
              Timezone
              <input value={tz} onChange={(e) => setTz(e.target.value)} placeholder="Europe/Berlin" className="rounded-lg bg-input px-2 py-1.5 text-xs text-foreground outline-none" />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted-foreground">
              Quiet from (hour)
              <select value={qStart === "" ? "" : String(qStart)} onChange={(e) => setQStart(e.target.value === "" ? "" : Number(e.target.value))} className="rounded-lg bg-input px-2 py-1.5 text-xs text-foreground outline-none">
                <option value="">Off</option>
                {Array.from({ length: 24 }).map((_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted-foreground">
              Quiet until
              <select value={qEnd === "" ? "" : String(qEnd)} onChange={(e) => setQEnd(e.target.value === "" ? "" : Number(e.target.value))} className="rounded-lg bg-input px-2 py-1.5 text-xs text-foreground outline-none">
                <option value="">Off</option>
                {Array.from({ length: 24 }).map((_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
              </select>
            </label>
          </div>
          <button onClick={savePrefs} className="mt-3 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90">Save preferences</button>
        </section>

        {/* List */}
        <section className="space-y-3">
          {busy ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
              <Bell className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm font-semibold">No bookmarks yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Tap the bell on any upcoming show to be notified before it starts.</p>
              <Link to="/live" className="mt-3 inline-block rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground">Browse upcoming shows</Link>
            </div>
          ) : (
            rows.map((r) => {
              const s = r.scheduled_shows!;
              return (
                <article key={r.id} className="flex gap-3 rounded-2xl border border-border bg-card p-3">
                  <Link to="/seller/$username" params={{ username: s.seller_username }} className="shrink-0">
                    {s.thumbnail_url ? (
                      <img src={s.thumbnail_url} alt="" className="h-20 w-20 rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-muted text-2xl">📺</div>
                    )}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link to="/seller/$username" params={{ username: s.seller_username }} className="text-xs font-semibold text-primary hover:underline">@{s.seller_username}</Link>
                    <p className="mt-0.5 truncate text-sm font-bold">{s.title}</p>
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground"><Calendar className="h-3 w-3" /> {fmt(s.scheduled_for)}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-primary"><Clock className="h-3 w-3" /> {timeLeft(s.scheduled_for)}</p>
                  </div>
                  <div className="self-start"><BookmarkButton showId={s.id} /></div>
                </article>
              );
            })
          )}
        </section>
      </div>
    </AppShell>
  );
}
