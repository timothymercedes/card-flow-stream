/**
 * /shows — landing for the host's scheduled shows.
 * Tabs make it easy to flip between "My Shows" and "Bookmarked",
 * each with a count bubble so users can spot saved shows at a glance.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { UpcomingShowsList } from "@/components/UpcomingShowsList";
import { ScheduledShowsPanel } from "@/components/ScheduledShowsPanel";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, Plus, ArrowLeft, Bookmark } from "lucide-react";

export const Route = createFileRoute("/shows/")({
  head: () => ({ meta: [{ title: "Upcoming Live Shows — PullBid Live" }, { name: "description", content: "Browse every upcoming live show, set reminders and add them to your calendar." }, { property: "og:title", content: "Upcoming Live Shows — PullBid Live" }, { property: "og:description", content: "See the full live show schedule on PullBid Live." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ShowsIndex,
});

function ShowsIndex() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"upcoming" | "hosting" | "bookmarked">("upcoming");
  const [counts, setCounts] = useState({ hosting: 0, bookmarked: 0 });

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [h, b] = await Promise.all([
        supabase.from("scheduled_shows" as any).select("id", { count: "exact", head: true }).eq("seller_id", user.id),
        supabase.from("show_bookmarks" as any).select("id", { count: "exact", head: true }).eq("user_id", user.id),
      ]);
      setCounts({ hosting: (h as any).count || 0, bookmarked: (b as any).count || 0 });
    })();
  }, [user, tab]);

  return (
    <AppShell>
      <div className="space-y-4 px-4 py-5">
        <div className="flex items-center gap-2">
          <Link to="/profile" className="rounded-full bg-muted p-2"><ArrowLeft className="h-4 w-4" /></Link>
          <h1 className="flex items-center gap-2 text-lg font-bold">
            <Calendar className="h-5 w-5 text-fuchsia-500" /> Live Show Schedule
          </h1>
        </div>

        <Link
          to="/shows/$id/edit"
          params={{ id: "new" }}
          preload={false}
          className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-3 text-sm font-extrabold text-white shadow"
        >
          <Plus className="h-4 w-4" /> Schedule a New Show
        </Link>

        <div className="flex gap-2 rounded-full bg-muted p-1">
          <button
            onClick={() => setTab("upcoming")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-extrabold transition ${tab === "upcoming" ? "bg-card text-foreground shadow" : "text-muted-foreground"}`}
          >
            <Calendar className="h-3.5 w-3.5" /> Upcoming
          </button>
          {user && <>
              <button
                onClick={() => setTab("hosting")}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-extrabold transition ${
                  tab === "hosting" ? "bg-card text-foreground shadow" : "text-muted-foreground"
                }`}
              >
                <Calendar className="h-3.5 w-3.5" /> My Shows
                <span className={`ml-0.5 grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[10px] ${
                  tab === "hosting" ? "bg-fuchsia-500 text-white" : "bg-foreground/10 text-foreground"
                }`}>{counts.hosting}</span>
              </button>
              <button
                onClick={() => setTab("bookmarked")}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-extrabold transition ${
                  tab === "bookmarked" ? "bg-card text-foreground shadow" : "text-muted-foreground"
                }`}
              >
                <Bookmark className="h-3.5 w-3.5" /> Bookmarked
                <span className={`ml-0.5 grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[10px] ${
                  tab === "bookmarked" ? "bg-emerald-500 text-white" : "bg-foreground/10 text-foreground"
                }`}>{counts.bookmarked}</span>
              </button>
          </>}
        </div>

        {tab === "upcoming" ? <UpcomingShowsList /> : user ? <ScheduledShowsPanel section={tab} /> : null}
      </div>
    </AppShell>
  );
}
