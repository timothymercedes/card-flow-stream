import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarClock, Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function UpcomingShowsSection({ sellerId }: { sellerId: string }) {
  const [shows, setShows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("scheduled_shows")
        .select("id, title, scheduled_for, thumbnail_url, banner_url, category, stream_id")
        .eq("seller_id", sellerId)
        .gte("scheduled_for", new Date(Date.now() - 1000 * 60 * 60).toISOString())
        .order("scheduled_for", { ascending: true })
        .limit(6);
      if (!cancelled) {
        setShows(data || []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sellerId]);

  if (loading || shows.length === 0) return null;

  return (
    <div className="mb-4 rounded-2xl bg-card p-3">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        <CalendarClock className="h-3.5 w-3.5" /> Upcoming shows
      </p>
      <div className="flex gap-2 overflow-x-auto">
        {shows.map((s) => {
          const when = new Date(s.scheduled_for);
          const diffMs = when.getTime() - Date.now();
          const live = diffMs <= 0 && diffMs > -1000 * 60 * 60 * 4;
          const label = live
            ? "Live now"
            : diffMs > 1000 * 60 * 60 * 24
              ? when.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
              : `in ${formatCountdown(diffMs)}`;
          return (
            <Link
              key={s.id}
              to="/shows/$id"
              params={{ id: s.id }}
              className="group min-w-[180px] max-w-[200px] shrink-0 overflow-hidden rounded-xl ring-1 ring-border"
            >
              <div className="relative aspect-video w-full bg-muted">
                {(s.banner_url || s.thumbnail_url) && (
                  <img src={s.banner_url || s.thumbnail_url} alt={s.title} className="h-full w-full object-cover" loading="lazy" />
                )}
                <span className={`absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${live ? "bg-live text-live-foreground" : "bg-black/60 text-white"}`}>
                  {live && <Radio className="h-2.5 w-2.5 animate-pulse" />} {label}
                </span>
              </div>
              <div className="p-2">
                <p className="line-clamp-1 text-xs font-bold">{s.title}</p>
                <p className="line-clamp-1 text-[10px] text-muted-foreground">
                  {when.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function formatCountdown(ms: number) {
  if (ms <= 0) return "now";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}
