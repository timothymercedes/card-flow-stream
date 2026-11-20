import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { loadMyContentArchive, type ArchiveItem } from "@/lib/contentArchive.functions";

export const Route = createFileRoute("/archive")({
  component: ContentArchive,
  head: () => ({ meta: [
    { title: "My Content Archive — PullBid Live" },
    { name: "description", content: "Your private archive of expired Stories, archived posts, photos and videos." },
    { name: "robots", content: "noindex, nofollow" },
    { property: "og:title", content: "My Content Archive — PullBid Live" },
    { property: "og:description", content: "Private archive visible only to you." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
});

const TABS = ["Stories", "Posts", "Photos & videos"] as const;

function ContentArchive() {
  const { user } = useAuth();
  const load = useServerFn(loadMyContentArchive);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Stories");
  const q = useQuery({ queryKey: ["my-archive", user?.id], queryFn: () => load(), enabled: !!user });
  if (!user) return <AppShell><div className="px-6 py-16 text-center"><h1 className="text-xl font-bold">Content Archive</h1><p className="mt-2 text-sm text-muted-foreground">Sign in to see your archive.</p><Link to="/auth" className="mt-4 inline-block rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">Sign in</Link></div></AppShell>;
  const all = q.data?.items ?? [];
  const shown: ArchiveItem[] = tab === "Stories" ? all.filter((i) => i.kind === "story") : tab === "Posts" ? all.filter((i) => i.kind === "post") : all.filter((i) => i.media_url);
  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-4 py-6">
        <h1 className="text-2xl font-black">My Content Archive</h1>
        <p className="text-sm text-muted-foreground">Only you can see this. Nothing here goes public again on its own.</p>
        <div className="mt-4 flex gap-2 overflow-x-auto">
          {TABS.map((t) => <button key={t} onClick={() => setTab(t)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${tab === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{t}</button>)}
          <Link to="/stories/archive" className="ml-auto shrink-0 rounded-full bg-muted px-3 py-1.5 text-xs font-bold">Manage Stories</Link>
        </div>
        {q.isPending ? <p className="mt-6 text-sm text-muted-foreground">Loading…</p> : q.isError ? <p className="mt-6 text-sm text-destructive">Couldn't load your archive.</p> : shown.length === 0 ? <p className="mt-6 text-sm text-muted-foreground">Nothing here yet.</p> : (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {shown.map((i) => (
              <article key={i.kind + i.id} className="overflow-hidden rounded-2xl border border-border bg-card">
                <div className="relative aspect-square bg-muted">
                  {i.media_url && (i.is_video ? <video src={i.media_url} controls className="h-full w-full object-cover" /> : <img src={i.media_url} alt={i.caption || i.label} className="h-full w-full object-cover" />)}
                  <span className="absolute left-2 top-2 rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-bold">{i.label}</span>
                </div>
                <div className="p-2 text-xs">{i.caption && <p className="line-clamp-2">{i.caption}</p>}<p className="text-muted-foreground">{new Date(i.created_at).toLocaleDateString()}</p></div>
              </article>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
