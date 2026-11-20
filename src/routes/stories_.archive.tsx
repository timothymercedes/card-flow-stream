import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/stories_/archive")({
  component: StoryArchive,
  head: () => ({ meta: [
    { title: "My Story Archive — PullBid Live" },
    { name: "description", content: "Your private archive of past Stories on PullBid Live." },
    { property: "og:title", content: "My Story Archive — PullBid Live" },
    { property: "og:description", content: "Replay, download or delete your past Stories." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
});

type Row = { id: string; image_url: string; caption: string | null; created_at: string; expires_at: string; visibility: string; views?: number; url?: string };

function StoryArchive() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);

  async function load() {
    if (!user) return;
    const { data } = await supabase.from("stories").select("id,image_url,caption,created_at,expires_at,visibility").eq("user_id", user.id).order("created_at", { ascending: false }).limit(200);
    const list = (data as Row[]) || [];
    const paths = list.map((r) => r.image_url.split("/stories/").pop()?.split("?")[0] || "");
    const { data: signed } = paths.some(Boolean) ? await supabase.storage.from("stories").createSignedUrls(paths.filter(Boolean), 600) : { data: [] as any[] };
    const byPath = new Map((signed || []).map((x: any) => [x.path, x.signedUrl]));
    const ids = list.map((r) => r.id);
    const { data: views } = ids.length ? await supabase.from("story_views").select("story_id").in("story_id", ids) : { data: [] as any[] };
    const vc = new Map<string, number>();
    for (const v of (views as any[]) || []) vc.set(v.story_id, (vc.get(v.story_id) || 0) + 1);
    setRows(list.map((r, i) => ({ ...r, url: byPath.get(paths[i]) || undefined, views: vc.get(r.id) || 0 })));
  }
  useEffect(() => { load(); }, [user?.id]);

  async function del(r: Row) {
    if (!confirm("Delete this Story from your archive?")) return;
    const { error } = await (supabase.rpc as any)("soft_delete_story", { _story_id: r.id });
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  }

  if (!user) return <AppShell><div className="px-6 py-16 text-center"><h1 className="text-xl font-bold">Story Archive</h1><p className="mt-2 text-sm text-muted-foreground">Sign in to see your past Stories.</p><Link to="/auth" className="mt-4 inline-block rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">Sign in</Link></div></AppShell>;

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-4 py-6">
        <h1 className="text-2xl font-black">My Story Archive</h1>
        <p className="text-sm text-muted-foreground">Only you can see this. Stories leave the public row after 24 hours but stay here. They never go public again on their own.</p>
        {rows === null ? <p className="mt-6 text-sm text-muted-foreground">Loading…</p> : rows.length === 0 ? <p className="mt-6 text-sm text-muted-foreground">No Stories yet.</p> : (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {rows.map((r) => {
              const live = new Date(r.expires_at) > new Date();
              return (
                <article key={r.id} className="overflow-hidden rounded-2xl border border-border bg-card">
                  <div className="relative aspect-[9/16] bg-muted">
                    {r.url && <img src={r.url} alt={r.caption || "Story"} className="h-full w-full object-cover" />}
                    <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${live ? "bg-primary text-primary-foreground" : "bg-background/80"}`}>{live ? "Live now" : "Archived"}</span>
                  </div>
                  <div className="space-y-1 p-2 text-xs">
                    {r.caption && <p className="line-clamp-2">{r.caption}</p>}
                    <p className="text-muted-foreground">{new Date(r.created_at).toLocaleString()} · {r.views} views</p>
                    <div className="flex gap-2">
                      {r.url && <a href={r.url} download target="_blank" rel="noreferrer" className="rounded-lg bg-muted px-2 py-1 font-bold">Download</a>}
                      <button onClick={() => del(r)} className="rounded-lg bg-destructive px-2 py-1 font-bold text-destructive-foreground">Delete</button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
