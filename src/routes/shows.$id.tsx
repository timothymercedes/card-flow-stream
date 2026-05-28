/**
 * /shows/$id — public scheduled show detail. Shows banner/info, bookmark
 * button (with realtime count), and a viewer Pre-B preview of items.
 */
import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAuthGate } from "@/hooks/useAuthGate";
import { AppShell } from "@/components/AppShell";
import { Calendar, Bookmark, BookmarkCheck, Radio, ArrowLeft, Users } from "lucide-react";
import { ShareButton } from "@/components/ShareButton";
import { toast } from "sonner";

export const Route = createFileRoute("/shows/$id")({ component: ShowDetail });

function ShowDetail() {
  const { id } = useParams({ from: "/shows/$id" });
  const { user } = useAuth();
  const { requireAuth } = useAuthGate();

  const [show, setShow] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarkCount, setBookmarkCount] = useState(0);

  useEffect(() => {
    let alive = true;
    async function refresh() {
      const [s, q, bc, mine] = await Promise.all([
        supabase.from("scheduled_shows" as any).select("*").eq("id", id).maybeSingle(),
        supabase.from("auction_queue" as any).select("*").eq("scheduled_show_id", id).order("position", { ascending: true }),
        supabase.from("show_bookmarks" as any).select("*", { count: "exact", head: true }).eq("show_id", id),
        user ? supabase.from("show_bookmarks" as any).select("id").eq("show_id", id).eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      if (!alive) return;
      setShow(s.data);
      setItems(((q.data as any[]) || []));
      setBookmarkCount((bc as any).count || 0);
      setBookmarked(!!(mine as any).data);
    }
    refresh();
    const ch = supabase.channel(`show-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "show_bookmarks", filter: `show_id=eq.${id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "auction_queue", filter: `scheduled_show_id=eq.${id}` }, refresh)
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [id, user]);

  async function toggleBookmark() {
    if (!requireAuth("bookmark this show")) return;
    if (bookmarked) {
      const { error } = await supabase.from("show_bookmarks" as any).delete().eq("show_id", id).eq("user_id", user!.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("show_bookmarks" as any).insert({ show_id: id, user_id: user!.id });
      if (error) return toast.error(error.message);
      toast.success("Bookmarked — we'll remind you when it goes live");
    }
  }

  if (!show) return <AppShell><div className="p-8 text-center text-sm text-muted-foreground">Loading…</div></AppShell>;

  const isHost = user?.id === show.seller_id;

  return (
    <AppShell>
      <div className="space-y-4 px-4 py-5">
        <div className="flex items-center gap-2">
          <Link to="/" className="rounded-full bg-muted p-2"><ArrowLeft className="h-4 w-4" /></Link>
          <h1 className="line-clamp-2 flex-1 text-lg font-bold">{show.title}</h1>
          <ShareButton
            entity={{ kind: "show", id, title: show.title, seller: show.seller_username, thumbnail: show.banner_url }}
            variant="icon"
          />
        </div>

        {show.banner_url && (
          <img src={show.banner_url} alt={show.title} className="h-44 w-full rounded-xl object-cover ring-1 ring-border" />
        )}

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {new Date(show.scheduled_for).toLocaleString()}</span>
          <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {bookmarkCount} interested</span>
          <span>by @{show.seller_username}</span>
        </div>

        {show.description && <p className="text-sm text-foreground/90">{show.description}</p>}

        <div className="flex flex-wrap gap-1">
          {(show.categories || []).map((c: string) => (
            <span key={c} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold">#{c}</span>
          ))}
        </div>

        <div className="flex gap-2">
          {isHost ? (
            <Link to="/shows/$id/edit" params={{ id }}
              className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-primary px-3 py-2.5 text-sm font-bold text-primary-foreground">
              Edit Show
            </Link>
          ) : (
            <button onClick={toggleBookmark}
              className={`flex flex-1 items-center justify-center gap-1 rounded-xl px-3 py-2.5 text-sm font-bold ${bookmarked ? "bg-emerald-500 text-white" : "bg-primary text-primary-foreground"}`}>
              {bookmarked ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
              {bookmarked ? "Bookmarked" : "Bookmark & remind me"}
            </button>
          )}
          {show.stream_id && (
            <Link to="/live/$id" params={{ id: show.stream_id }}
              className="flex items-center gap-1 rounded-xl bg-live px-3 py-2.5 text-sm font-bold text-live-foreground">
              <Radio className="h-4 w-4 animate-pulse" /> Live
            </Link>
          )}
        </div>

        <div>
          <h2 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Pre-B Items ({items.length})</h2>
          {items.length === 0 ? (
            <p className="rounded-xl bg-muted/30 p-4 text-center text-xs text-muted-foreground">Host hasn't added items yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {items.map((it, i) => (
                <li key={it.id} className="flex items-center gap-2 rounded-xl bg-card p-2 ring-1 ring-border">
                  {it.image_url
                    ? <img src={it.image_url} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                    : <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-muted text-xs font-bold text-muted-foreground">#{i + 1}</div>}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{it.title}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {it.sale_type === "buynow" && `Buy Now · $${Number(it.buy_now_price ?? it.starting_bid).toFixed(0)}`}
                      {it.sale_type === "offer" && `Make Offer${it.min_offer ? ` · min $${Number(it.min_offer).toFixed(0)}` : ""}`}
                      {(!it.sale_type || it.sale_type === "prebid") && `Pre-Bid · start $${Number(it.starting_bid).toFixed(0)}`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}
