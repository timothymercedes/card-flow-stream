import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { StoryRail } from "@/components/StoryRail";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/stories")({
  head: () => ({ meta: [{ title: "Stories — PullBid Live" }, { name: "description", content: "Browse community stories." }] }),
  component: StoriesPage,
});

type Story = { id: string; user_id: string; username: string; avatar_url: string | null; image_url: string; caption: string | null; created_at: string };

function StoriesPage() {
  const [stories, setStories] = useState<Story[]>([]);
  const [active, setActive] = useState<Story | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("stories")
        .select("*")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(200);
      setStories((data as Story[]) || []);
    })();
  }, []);

  return (
    <AppShell>
      <div className="px-4 py-4">
        <h1 className="mb-3 text-xl font-bold">Stories</h1>
        <p className="mb-3 text-xs text-muted-foreground">Tap a circle to add yours, or browse community posts below.</p>
        <StoryRail />

        <div className="mb-2 mt-4 text-xs font-bold uppercase text-muted-foreground">All active stories</div>
        {stories.length === 0 && <p className="py-12 text-center text-xs text-muted-foreground">No stories yet — be the first to post!</p>}
        <div className="grid grid-cols-3 gap-2">
          {stories.map((s) => (
            <button key={s.id} onClick={() => setActive(s)} className="relative aspect-[3/4] overflow-hidden rounded-lg bg-muted">
              <img src={s.image_url} className="h-full w-full object-cover" alt={s.caption || "story"} />
              <div className="absolute bottom-0 left-0 right-0 flex items-center gap-1 bg-gradient-to-t from-black/80 to-transparent px-2 py-1 text-[10px] text-white">
                <span className="truncate">@{s.username}</span>
              </div>
            </button>
          ))}
        </div>

        {active && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-2" onClick={() => setActive(null)}>
            <div onClick={(e) => e.stopPropagation()} className="relative max-h-[90vh] w-full max-w-md">
              <img src={active.image_url} className="max-h-[90vh] w-full object-contain" alt="" />
              <div className="absolute left-3 right-3 top-3 rounded-lg bg-black/60 p-2 text-white">
                <p className="text-sm font-bold">@{active.username}</p>
                <p className="text-[10px] opacity-70">{new Date(active.created_at).toLocaleString()}</p>
              </div>
              {active.caption && (
                <div className="absolute bottom-6 left-3 right-3 rounded-lg bg-black/60 p-2 text-sm text-white">{active.caption}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
