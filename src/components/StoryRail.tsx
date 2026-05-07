import { useEffect, useState, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Plus, X, Lock, Users, Globe, User } from "lucide-react";
import { toast } from "sonner";

type Story = {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  image_url: string;
  caption: string | null;
  visibility: string;
  created_at: string;
  expires_at: string;
};

const STORY_REACTIONS = [
  { key: "like", emoji: "👍" },
  { key: "love", emoji: "❤️" },
  { key: "fire", emoji: "🔥" },
  { key: "laugh", emoji: "😂" },
  { key: "wow", emoji: "😮" },
  { key: "clap", emoji: "👏" },
  { key: "money", emoji: "💯" },
] as const;

export function StoryRail() {
  const { user, profile } = useAuth();
  const [stories, setStories] = useState<Story[]>([]);
  const [active, setActive] = useState<{ group: Story[]; index: number } | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [visibility, setVisibility] = useState<"public" | "followers" | "close_friends">("public");
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [reactions, setReactions] = useState<Record<string, { mine?: string; counts: Record<string, number> }>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const { data } = await supabase
      .from("stories")
      .select("*")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    setStories((data as Story[]) || []);
  }

  async function loadReactions(ids: string[]) {
    if (ids.length === 0) { setReactions({}); return; }
    const { data } = await (supabase as any).from("story_reactions").select("story_id,user_id,reaction").in("story_id", ids);
    const map: Record<string, { mine?: string; counts: Record<string, number> }> = {};
    (data || []).forEach((r: any) => {
      if (!map[r.story_id]) map[r.story_id] = { counts: {} };
      map[r.story_id].counts[r.reaction] = (map[r.story_id].counts[r.reaction] || 0) + 1;
      if (user && r.user_id === user.id) map[r.story_id].mine = r.reaction;
    });
    setReactions(map);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("stories-rail")
      .on("postgres_changes", { event: "*", schema: "public", table: "stories" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "story_reactions" }, () => loadReactions(stories.map((s) => s.id)))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadReactions(stories.map((s) => s.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stories.length, user?.id]);

  // group by user
  const groups = Object.values(
    stories.reduce<Record<string, Story[]>>((acc, s) => {
      acc[s.user_id] = acc[s.user_id] || [];
      acc[s.user_id].push(s);
      return acc;
    }, {})
  );

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user || !profile) return;
    setUploading(true);
    try {
      const path = `${user.id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("stories").upload(path, file);
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("stories").getPublicUrl(path);

      // AI moderation before publishing
      try {
        const { data: mod } = await supabase.functions.invoke("moderate-image", { body: { image_url: pub.publicUrl } });
        if (mod && (mod as any).allowed === false) {
          await supabase.storage.from("stories").remove([path]);
          toast.error(`Story blocked: ${(mod as any).reason || "inappropriate content"}`);
          return;
        }
      } catch { /* fail-open */ }

      const { error } = await supabase.from("stories").insert({
        user_id: user.id,
        username: profile.username,
        avatar_url: profile.avatar_url,
        image_url: pub.publicUrl,
        caption: caption || null,
        visibility,
      });
      if (error) throw error;
      toast.success("Story posted");
      setCaption("");
      setComposeOpen(false);
      load();
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function deleteStory(s: Story) {
    if (!confirm("Delete this story?")) return;
    await supabase.from("stories").delete().eq("id", s.id);
    setActive(null);
    load();
  }

  async function reactStory(storyId: string, key: string) {
    if (!user) return toast.error("Sign in to react");
    const cur = reactions[storyId];
    if (cur?.mine === key) {
      await (supabase as any).from("story_reactions").delete().eq("story_id", storyId).eq("user_id", user.id);
    } else if (cur?.mine) {
      await (supabase as any).from("story_reactions").update({ reaction: key }).eq("story_id", storyId).eq("user_id", user.id);
    } else {
      await (supabase as any).from("story_reactions").insert({ story_id: storyId, user_id: user.id, reaction: key });
    }
    loadReactions(stories.map((s) => s.id));
  }

  return (
    <>
      <div className="mb-3 flex gap-3 overflow-x-auto pb-2">
        {user && (
          <button onClick={() => setComposeOpen(true)} className="flex flex-shrink-0 flex-col items-center gap-1">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-primary bg-card">
              <Plus className="h-6 w-6 text-primary" />
            </div>
            <span className="text-[10px]">Your story</span>
          </button>
        )}
        {groups.map((g) => {
          const first = g[0];
          return (
            <div key={first.user_id} className="flex flex-shrink-0 flex-col items-center gap-1">
              <button onClick={() => setActive({ group: g, index: 0 })}>
                <div className="rounded-full bg-gradient-to-br from-primary to-live p-[2px]">
                  <div className="h-16 w-16 overflow-hidden rounded-full bg-card">
                    {first.avatar_url ? <img src={first.avatar_url} loading="lazy" decoding="async" className="h-full w-full object-cover" alt="" /> : <div className="flex h-full w-full items-center justify-center text-sm font-bold">{first.username[0]?.toUpperCase()}</div>}
                  </div>
                </div>
              </button>
              <Link
                to="/seller/$username"
                params={{ username: first.username }}
                className="line-clamp-1 max-w-[64px] text-[10px] hover:text-primary"
              >
                @{first.username}
              </Link>
            </div>
          );
        })}
      </div>

      {composeOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={() => setComposeOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold">New story</p>
              <button onClick={() => setComposeOpen(false)}><X className="h-4 w-4" /></button>
            </div>
            <div className="mb-3 flex gap-2">
              {([
                { v: "public", icon: Globe, label: "Public" },
                { v: "followers", icon: Users, label: "Followers" },
                { v: "close_friends", icon: Lock, label: "Private" },
              ] as const).map(({ v, icon: Icon, label }) => (
                <button key={v} onClick={() => setVisibility(v)} className={`flex flex-1 flex-col items-center gap-1 rounded-lg p-2 text-[11px] ${visibility === v ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>
            <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption (optional)" className="mb-3 w-full rounded-lg bg-input px-3 py-2 text-sm outline-none" />
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
            <button onClick={() => fileRef.current?.click()} disabled={uploading} className="w-full rounded-lg bg-primary py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">
              {uploading ? "Checking & uploading..." : "Choose photo & post"}
            </button>
            <p className="mt-2 text-center text-[10px] text-muted-foreground">Story expires in 24 hours · AI-moderated</p>
          </div>
        </div>
      )}

      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95" onClick={() => setActive(null)}>
          <div onClick={(e) => e.stopPropagation()} className="relative h-full max-h-[90vh] w-full max-w-md">
            <button onClick={() => setActive(null)} className="absolute right-3 top-3 z-20 rounded-full bg-black/50 p-1.5 text-white"><X className="h-5 w-5" /></button>
            {(() => {
              const s = active.group[active.index];
              const isMine = user?.id === s.user_id;
              const r = reactions[s.id] || { counts: {} };
              const total = Object.values(r.counts).reduce((a, b) => a + b, 0);
              return (
                <div className="relative h-full">
                  <img src={s.image_url} loading="lazy" decoding="async" className="h-full w-full object-contain" alt="" />
                  <div className="absolute left-3 right-12 top-3 z-10 flex items-center gap-2 text-white">
                    <Link
                      to="/seller/$username"
                      params={{ username: s.username }}
                      onClick={() => setActive(null)}
                      className="flex items-center gap-2 rounded-full bg-black/50 p-1 pr-3 hover:bg-black/70"
                    >
                      <div className="h-8 w-8 overflow-hidden rounded-full bg-card">
                        {s.avatar_url ? <img src={s.avatar_url} className="h-full w-full object-cover" alt="" /> : <User className="m-auto h-4 w-4" />}
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold">@{s.username}</p>
                        <p className="text-[10px] opacity-70">{new Date(s.created_at).toLocaleString()} · {s.visibility}</p>
                      </div>
                    </Link>
                    {isMine && <button onClick={() => deleteStory(s)} className="rounded-full bg-black/50 px-2 py-1 text-[10px]">Delete</button>}
                  </div>
                  {s.caption && <div className="absolute bottom-20 left-3 right-3 rounded-lg bg-black/60 p-2 text-sm text-white">{s.caption}</div>}

                  {/* Reactions bar */}
                  <div className="absolute bottom-3 left-3 right-3 z-10 flex items-center justify-center gap-1 rounded-full bg-black/60 p-1.5 backdrop-blur">
                    {STORY_REACTIONS.map((rx) => (
                      <button
                        key={rx.key}
                        onClick={(e) => { e.stopPropagation(); reactStory(s.id, rx.key); }}
                        className={`flex h-9 w-9 items-center justify-center rounded-full text-xl transition hover:scale-125 ${r.mine === rx.key ? "bg-white/25" : ""}`}
                      >
                        {rx.emoji}
                      </button>
                    ))}
                    {total > 0 && <span className="ml-1 text-[11px] font-bold text-white">{total}</span>}
                  </div>

                  {active.index > 0 && (
                    <button onClick={(e) => { e.stopPropagation(); setActive({ ...active, index: active.index - 1 }); }} className="absolute left-0 top-12 h-[60%] w-1/3" />
                  )}
                  {active.index < active.group.length - 1 && (
                    <button onClick={(e) => { e.stopPropagation(); setActive({ ...active, index: active.index + 1 }); }} className="absolute right-0 top-12 h-[60%] w-1/3" />
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </>
  );
}
