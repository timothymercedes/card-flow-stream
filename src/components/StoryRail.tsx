import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAuthGate } from "@/hooks/useAuthGate";
import { Plus } from "lucide-react";
import { StoryViewer } from "@/components/StoryViewer";
import { StoryComposer } from "@/components/StoryComposer";
import { signStories, groupStories, firstUnreadIndex, loadSeen, type Story } from "@/lib/stories";

/** Horizontal story circles. Pass userId to show only one member's stories (profiles). */
export function StoryRail({ userId, label }: { userId?: string; label?: string } = {}) {
  const { user, profile } = useAuth();
  const { requireAuth } = useAuthGate();
  const [stories, setStories] = useState<Story[]>([]);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<{ group: number; index: number } | null>(null);
  const [compose, setCompose] = useState(false);

  const load = useCallback(async () => {
    let q = supabase.from("stories").select("*").gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(300);
    if (userId) q = q.eq("user_id", userId);
    const { data } = await q;
    const rows = await signStories(data || []);
    setStories(rows);
    setSeen(await loadSeen(user?.id, rows.map((r) => r.id)));
  }, [userId, user?.id]);

  useEffect(() => {
    void load();
    const ch = supabase.channel(`stories-rail-${userId || "all"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "stories" }, () => void load()).subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [load, userId]);

  const groups = groupStories(stories, seen, user?.id);
  const myGroup = groups.findIndex((g) => g.stories[0]!.user_id === user?.id);
  const showAdd = !!user && (!userId || userId === user.id);
  if (userId && !groups.length && !showAdd) return null;

  return (
    <>
      <div className="mb-3 flex gap-3 overflow-x-auto pb-2" role="list" aria-label={label || "Stories"}>
        {showAdd && (
          <div className="flex flex-shrink-0 flex-col items-center gap-1" role="listitem">
            <div className="relative">
              <button aria-label={myGroup >= 0 ? "View your story" : "Add story"} onClick={() => (myGroup >= 0 ? setOpen({ group: myGroup, index: 0 }) : setCompose(true))}
                className={`block rounded-full p-[2px] ${myGroup >= 0 ? (groups[myGroup]!.unread ? "bg-gradient-to-tr from-primary via-accent to-live" : "bg-muted-foreground/40") : ""}`}>
                <span className="block h-16 w-16 overflow-hidden rounded-full border-2 border-background bg-muted">
                  {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center font-bold">{profile?.username?.[0]?.toUpperCase()}</span>}
                </span>
              </button>
              <button aria-label="Add story" onClick={() => setCompose(true)} className="absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-background bg-primary p-0.5 text-primary-foreground"><Plus className="h-3.5 w-3.5" /></button>
            </div>
            <span className="max-w-[68px] truncate text-[10px]">Your story</span>
          </div>
        )}
        {groups.map((g, gi) => {
          const f = g.stories[0]!;
          if (f.user_id === user?.id && showAdd) return null;
          return (
            <div key={f.user_id} className="flex flex-shrink-0 flex-col items-center gap-1" role="listitem">
              <button aria-label={`${g.unread ? "New stories" : "Stories"} from @${f.username}`} onClick={() => setOpen({ group: gi, index: firstUnreadIndex(g.stories, seen) })}
                className={`rounded-full p-[2px] ${g.unread ? "bg-gradient-to-tr from-primary via-accent to-live" : "bg-muted-foreground/40"}`}>
                <span className="block h-16 w-16 overflow-hidden rounded-full border-2 border-background bg-muted">
                  {f.avatar_url ? <img src={f.avatar_url} loading="lazy" alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center font-bold">{f.username[0]?.toUpperCase()}</span>}
                </span>
              </button>
              <span className={`max-w-[68px] truncate text-[10px] ${g.unread ? "font-bold" : "text-muted-foreground"}`}>{f.username}</span>
            </div>
          );
        })}
        {!user && !userId && groups.length === 0 && (
          <button onClick={() => requireAuth("post a story")} className="flex flex-shrink-0 flex-col items-center gap-1">
            <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-primary"><Plus className="h-6 w-6 text-primary" /></span>
            <span className="text-[10px]">Add story</span>
          </button>
        )}
      </div>
      {open && <StoryViewer groups={groups.map((g) => g.stories)} start={open} onClose={() => setOpen(null)} onChanged={load} onSeen={(id) => setSeen((s) => (s.has(id) ? s : new Set(s).add(id)))} />}
      {compose && <StoryComposer onClose={() => setCompose(false)} onPosted={load} />}
    </>
  );
}
