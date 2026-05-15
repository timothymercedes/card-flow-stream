/**
 * ScheduledShowsPanel — list of the user's hosted shows + bookmarked shows.
 * Embedded in profile and on /shows. Hosts see Edit links for their own shows
 * and can multi-select to bulk delete.
 */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Calendar, Edit, Bookmark, Plus, Trash2, CheckSquare, Square } from "lucide-react";
import { toast } from "sonner";

type Show = {
  id: string;
  title: string;
  description: string | null;
  banner_url: string | null;
  scheduled_for: string;
  seller_id: string;
  seller_username: string;
  stream_id: string | null;
  categories: string[] | null;
};

export function ScheduledShowsPanel({ compact }: { compact?: boolean }) {
  const { user } = useAuth();
  const [hosting, setHosting] = useState<Show[]>([]);
  const [bookmarked, setBookmarked] = useState<Show[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  async function load() {
    if (!user) { setLoading(false); return; }
    const [own, marks] = await Promise.all([
      supabase.from("scheduled_shows" as any).select("*").eq("seller_id", user.id).order("scheduled_for", { ascending: true }),
      supabase.from("show_bookmarks" as any).select("show_id, scheduled_shows(*)").eq("user_id", user.id),
    ]);
    setHosting((own.data as any[] as Show[]) || []);
    setBookmarked(((marks.data as any[]) || []).map((r) => r.scheduled_shows).filter(Boolean) as Show[]);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (selected.size === hosting.length) setSelected(new Set());
    else setSelected(new Set(hosting.map((s) => s.id)));
  }
  async function deleteSelected() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} show${selected.size > 1 ? "s" : ""}? Pre-B items will be removed too.`)) return;
    setDeleting(true);
    const ids = Array.from(selected);
    const { error } = await supabase.from("scheduled_shows" as any).delete().in("id", ids);
    setDeleting(false);
    if (error) return toast.error(error.message);
    toast.success(`Deleted ${ids.length} show${ids.length > 1 ? "s" : ""}`);
    setSelected(new Set());
    load();
  }

  if (loading) return <p className="rounded-xl bg-muted/30 p-4 text-center text-xs text-muted-foreground">Loading shows…</p>;

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" /> My Scheduled Shows
          </h3>
          <div className="flex items-center gap-1">
            {hosting.length > 0 && (
              <button
                onClick={toggleAll}
                className="flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[10px] font-bold"
              >
                {selected.size === hosting.length ? <CheckSquare className="h-3 w-3" /> : <Square className="h-3 w-3" />}
                {selected.size === hosting.length ? "Unselect" : "Select all"}
              </button>
            )}
            <Link to="/shows/$id/edit" params={{ id: "new" }} preload={false} className="flex items-center gap-1 rounded-full bg-fuchsia-500 px-2 py-1 text-[10px] font-bold text-white">
              <Plus className="h-3 w-3" /> New
            </Link>
          </div>
        </div>

        {selected.size > 0 && (
          <div className="mb-2 flex items-center justify-between rounded-xl bg-destructive/10 px-3 py-2 ring-1 ring-destructive/30">
            <span className="text-[11px] font-bold text-destructive">{selected.size} selected</span>
            <button
              onClick={deleteSelected}
              disabled={deleting}
              className="flex items-center gap-1 rounded-md bg-destructive px-2 py-1 text-[10px] font-bold text-destructive-foreground disabled:opacity-50"
            >
              <Trash2 className="h-3 w-3" /> {deleting ? "Deleting…" : "Delete selected"}
            </button>
          </div>
        )}

        {hosting.length === 0 ? (
          <p className="rounded-xl bg-muted/30 p-4 text-center text-xs text-muted-foreground">
            You haven't scheduled any shows yet.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {hosting.slice(0, compact ? 3 : 50).map((s) => {
              const isSel = selected.has(s.id);
              return (
                <li key={s.id} className={`flex items-center gap-2 rounded-xl bg-card p-2 ring-1 ${isSel ? "ring-destructive" : "ring-border"}`}>
                  <button
                    onClick={() => toggle(s.id)}
                    aria-label={isSel ? "Unselect" : "Select"}
                    className="shrink-0 rounded-md p-1 hover:bg-muted"
                  >
                    {isSel ? <CheckSquare className="h-4 w-4 text-destructive" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                  </button>
                  {s.banner_url
                    ? <img src={s.banner_url} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                    : <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><Calendar className="h-4 w-4" /></div>}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{s.title}</p>
                    <p className="text-[10px] text-muted-foreground">{new Date(s.scheduled_for).toLocaleString()}</p>
                  </div>
                  <Link to="/shows/$id/edit" params={{ id: s.id }}
                    className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[10px] font-bold text-primary-foreground">
                    <Edit className="h-3 w-3" /> Edit
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
          <Bookmark className="h-3.5 w-3.5" /> Bookmarked Shows
        </h3>
        {bookmarked.length === 0 ? (
          <p className="rounded-xl bg-muted/30 p-4 text-center text-xs text-muted-foreground">
            No bookmarked shows yet.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {bookmarked.slice(0, compact ? 3 : 50).map((s) => (
              <li key={s.id} className="flex items-center gap-2 rounded-xl bg-card p-2 ring-1 ring-border">
                {s.banner_url
                  ? <img src={s.banner_url} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                  : <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><Calendar className="h-4 w-4" /></div>}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{s.title}</p>
                  <p className="text-[10px] text-muted-foreground">@{s.seller_username} · {new Date(s.scheduled_for).toLocaleString()}</p>
                </div>
                <Link to="/shows/$id" params={{ id: s.id }}
                  className="rounded-md bg-muted px-2 py-1 text-[10px] font-bold">View</Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
