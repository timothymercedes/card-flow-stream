import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { StoryRail } from "@/components/StoryRail";
import { StoryViewer } from "@/components/StoryViewer";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { signStories, type Story } from "@/lib/stories";

export const Route = createFileRoute("/stories")({
  head: () => ({ meta: [
    { title: "Stories — PullBid Live" },
    { name: "description", content: "Watch collector stories from the PullBid Live community." },
    { property: "og:title", content: "Stories — PullBid Live" },
    { property: "og:description", content: "Watch collector stories from the PullBid Live community." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: StoriesPage,
});

function StoriesPage() {
  const [stories, setStories] = useState<Story[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const load = async () => {
    const { data } = await supabase.from("stories").select("*").gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(200);
    setStories(await signStories(data || []));
  };
  useEffect(() => { void load(); }, []);

  return (
    <AppShell>
      <div className="px-4 py-4">
        <div className="mb-3 flex items-center justify-between"><h1 className="text-xl font-bold">Stories</h1><Link to="/stories/archive" className="rounded-full bg-muted px-3 py-1.5 text-xs font-bold">My archive</Link></div>
        <StoryRail />
        <div className="mb-2 mt-4 text-xs font-bold uppercase text-muted-foreground">All active stories</div>
        {stories.length === 0 && <p className="py-12 text-center text-xs text-muted-foreground">No stories yet — be the first to post!</p>}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {stories.map((s, i) => (
            <button key={s.id} onClick={() => setOpen(i)} className="relative aspect-[9/16] overflow-hidden rounded-lg bg-muted">
              {s.media_type === "video" ? <video src={s.image_url} muted playsInline className="h-full w-full object-cover" /> : <img src={s.image_url} loading="lazy" className="h-full w-full object-cover" alt={s.caption || `Story by @${s.username}`} />}
              <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-2 py-1 text-left text-[10px] text-white">@{s.username}</span>
            </button>
          ))}
        </div>
        {open !== null && <StoryViewer groups={stories.map((s) => [s])} start={{ group: open, index: 0 }} onClose={() => setOpen(null)} onChanged={load} />}
      </div>
    </AppShell>
  );
}
