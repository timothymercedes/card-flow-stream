/**
 * /shows — landing for the host's scheduled shows.
 * Shows the user's own scheduled shows + bookmarked shows with a
 * "Schedule new show" CTA. This is what the Sell → Schedule Show button
 * routes to so users can pick between viewing existing shows or adding one.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { ScheduledShowsPanel } from "@/components/ScheduledShowsPanel";
import { useAuth } from "@/hooks/useAuth";
import { Calendar, Plus, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/shows/")({ component: ShowsIndex });

function ShowsIndex() {
  const { user } = useAuth();

  return (
    <AppShell>
      <div className="space-y-4 px-4 py-5">
        <div className="flex items-center gap-2">
          <Link to="/profile" className="rounded-full bg-muted p-2"><ArrowLeft className="h-4 w-4" /></Link>
          <h1 className="flex items-center gap-2 text-lg font-bold">
            <Calendar className="h-5 w-5 text-fuchsia-500" /> Scheduled Shows
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

        {!user ? (
          <p className="rounded-xl bg-muted/30 p-4 text-center text-sm text-muted-foreground">
            Sign in to see and schedule shows.
          </p>
        ) : (
          <ScheduledShowsPanel />
        )}
      </div>
    </AppShell>
  );
}
