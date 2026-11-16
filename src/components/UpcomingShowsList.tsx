import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Show = { id: string; title: string; seller_username: string | null; category: string | null; scheduled_for: string; thumbnail_url: string | null; banner_url: string | null };

/** Public schedule of every upcoming show, grouped by day with a category filter. */
export function UpcomingShowsList() {
  const [shows, setShows] = useState<Show[] | null>(null);
  const [cat, setCat] = useState("all");
  useEffect(() => {
    supabase.from("scheduled_shows").select("id,title,seller_username,category,scheduled_for,thumbnail_url,banner_url")
      .gte("scheduled_for", new Date().toISOString()).order("scheduled_for").limit(100)
      .then(({ data }) => setShows((data as Show[]) ?? []));
  }, []);
  const cats = useMemo(() => ["all", ...Array.from(new Set((shows ?? []).map(s => s.category).filter(Boolean) as string[]))], [shows]);
  const groups = useMemo(() => {
    const m = new Map<string, Show[]>();
    for (const s of shows ?? []) if (cat === "all" || s.category === cat) {
      const k = new Date(s.scheduled_for).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return [...m.entries()];
  }, [shows, cat]);

  if (shows === null) return <p className="py-6 text-center text-sm text-muted-foreground">Loading schedule…</p>;
  return (
    <div className="space-y-4">
      {cats.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {cats.map(c => <button key={c} onClick={() => setCat(c)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold capitalize ${cat === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{c === "all" ? "All" : c.replaceAll("_", " ")}</button>)}
        </div>
      )}
      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-6 text-center">
          <CalendarClock className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm font-semibold">No shows scheduled yet</p>
          <p className="text-xs text-muted-foreground">Be the first — schedule a show and buyers can set reminders.</p>
        </div>
      ) : groups.map(([day, list]) => (
        <section key={day}>
          <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wide text-muted-foreground">{day}</h3>
          <div className="space-y-2">
            {list.map(s => (
              <Link key={s.id} to="/shows/$id" params={{ id: s.id }} className="flex items-center gap-3 rounded-xl bg-card p-2.5 ring-1 ring-border hover:bg-muted/50">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {(s.thumbnail_url || s.banner_url) && <img src={s.thumbnail_url || s.banner_url!} alt="" loading="lazy" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{s.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{s.seller_username ? `@${s.seller_username}` : "Host"}{s.category ? ` · ${s.category.replaceAll("_", " ")}` : ""}</p>
                </div>
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-[11px] font-bold text-primary">
                  {new Date(s.scheduled_for).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
