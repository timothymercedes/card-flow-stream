import { useEffect, useState, useRef, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Plus, X, Lock, Users, Globe, User, Eye, Heart, ChevronLeft, ChevronRight } from "lucide-react";
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

type ReactionRow = { story_id: string; user_id: string; reaction: string; created_at: string };
type ViewerRow = { story_id: string; viewer_id: string; viewed_at: string };
type ProfileLite = { id: string; username: string; avatar_url: string | null };

const STORY_REACTIONS = [
  { key: "love", emoji: "❤️" },
  { key: "fire", emoji: "🔥" },
  { key: "eyes", emoji: "👀" },
  { key: "laugh", emoji: "😂" },
  { key: "wow", emoji: "😮" },
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
  const [reactions, setReactions] = useState<Record<string, { mine?: string; counts: Record<string, number>; rows: ReactionRow[] }>>({});
  const [viewersByStory, setViewersByStory] = useState<Record<string, ViewerRow[]>>({});
  const [insightsOpen, setInsightsOpen] = useState<"reactions" | "viewers" | null>(null);
  const [profileMap, setProfileMap] = useState<Record<string, ProfileLite>>({});
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
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
    const { data } = await (supabase as any).from("story_reactions").select("story_id,user_id,reaction,created_at").in("story_id", ids);
    const map: Record<string, { mine?: string; counts: Record<string, number>; rows: ReactionRow[] }> = {};
    (data || []).forEach((r: ReactionRow) => {
      if (!map[r.story_id]) map[r.story_id] = { counts: {}, rows: [] };
      map[r.story_id].counts[r.reaction] = (map[r.story_id].counts[r.reaction] || 0) + 1;
      map[r.story_id].rows.push(r);
      if (user && r.user_id === user.id) map[r.story_id].mine = r.reaction;
    });
    setReactions(map);
  }

  async function loadViewersFor(storyId: string) {
    const { data } = await supabase.from("story_views").select("story_id,viewer_id,viewed_at").eq("story_id", storyId);
    setViewersByStory((m) => ({ ...m, [storyId]: (data as ViewerRow[]) || [] }));
    await ensureProfiles(((data as ViewerRow[]) || []).map((v) => v.viewer_id));
  }

  async function ensureProfiles(ids: string[]) {
    const missing = Array.from(new Set(ids.filter((id) => id && !profileMap[id])));
    if (missing.length === 0) return;
    const { data } = await supabase.from("profiles").select("id,username,avatar_url").in("id", missing);
    if (data) {
      setProfileMap((m) => {
        const next = { ...m };
        (data as ProfileLite[]).forEach((p) => { next[p.id] = p; });
        return next;
      });
    }
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

  // Public stories list (flat) for left/right arrow navigation across users on web
  const publicFlat = useMemo(() => stories.filter((s) => s.visibility === "public"), [stories]);

  function clearPending() {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(null);
    setPendingPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(file);
    setPendingPreview(URL.createObjectURL(file));
  }

  async function confirmAndUpload() {
    if (!pendingFile || !user || !profile) return;
    const file = pendingFile;
    setUploading(true);
    try {
      const path = `${user.id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("stories").upload(path, file);
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("stories").getPublicUrl(path);

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
      clearPending();
      load();
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function deleteStory(s: Story) {
    if (!confirm("Delete this story?")) return;
    await supabase.from("stories").delete().eq("id", s.id);
    setActive(null);
    load();
  }

  async function reactStory(story: Story, key: string) {
    if (!user) return toast.error("Sign in to react");
    const cur = reactions[story.id];
    if (cur?.mine === key) {
      await (supabase as any).from("story_reactions").delete().eq("story_id", story.id).eq("user_id", user.id);
    } else {
      const op = cur?.mine
        ? (supabase as any).from("story_reactions").update({ reaction: key }).eq("story_id", story.id).eq("user_id", user.id)
        : (supabase as any).from("story_reactions").insert({ story_id: story.id, user_id: user.id, reaction: key });
      const { error } = await op;
      if (error) { toast.error(error.message); return; }
      // Notify owner (skip self, skip if just switching reaction)
      if (!cur?.mine && story.user_id !== user.id) {
        const emoji = STORY_REACTIONS.find((r) => r.key === key)?.emoji || "";
        await supabase.from("notifications").insert({
          user_id: story.user_id,
          type: "story_reaction",
          body: `@${profile?.username || "someone"} reacted ${emoji} to your story`,
          link: "/stories",
          sender_id: user.id,
        });
      }
    }
    loadReactions(stories.map((s) => s.id));
  }

  // Track view + load owner insights when active changes
  useEffect(() => {
    if (!active) return;
    const s = active.group[active.index];
    if (!s) return;
    if (user && user.id !== s.user_id) {
      supabase.from("story_views").upsert(
        [{ story_id: s.id, viewer_id: user.id, viewed_at: new Date().toISOString() }],
        { onConflict: "story_id,viewer_id" }
      ).then(() => {});
    }
    if (user && user.id === s.user_id) {
      loadViewersFor(s.id);
      ensureProfiles((reactions[s.id]?.rows || []).map((r) => r.user_id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.group[active?.index ?? 0]?.id, user?.id]);

  // Web keyboard navigation: ← previous public story, → next public story
  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setActive(null); setInsightsOpen(null); return; }
      if (insightsOpen) return;
      if (e.key === "ArrowRight") goPublic(1);
      else if (e.key === "ArrowLeft") goPublic(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, insightsOpen, publicFlat.length]);

  function goPublic(dir: 1 | -1) {
    if (!active) return;
    const cur = active.group[active.index];
    if (!cur) return;
    // If inside a group, prefer in-group nav first
    if (dir === 1 && active.index < active.group.length - 1) {
      setActive({ ...active, index: active.index + 1 }); return;
    }
    if (dir === -1 && active.index > 0) {
      setActive({ ...active, index: active.index - 1 }); return;
    }
    if (publicFlat.length === 0) { setActive(null); return; }
    const idx = publicFlat.findIndex((s) => s.id === cur.id);
    const nextIdx = idx === -1 ? 0 : (idx + dir + publicFlat.length) % publicFlat.length;
    const nextStory = publicFlat[nextIdx];
    const grp = stories.filter((s) => s.user_id === nextStory.user_id);
    setActive({ group: grp, index: Math.max(0, grp.findIndex((s) => s.id === nextStory.id)) });
  }

  function goWithinGroup(dir: 1 | -1) {
    if (!active) return;
    const next = active.index + dir;
    if (next < 0 || next >= active.group.length) {
      // fall back to public flat nav so center-tap on last/first still moves you forward
      goPublic(dir);
      return;
    }
    setActive({ ...active, index: next });
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
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={() => { if (!uploading) { setComposeOpen(false); clearPending(); } }}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold">New story</p>
              <button disabled={uploading} onClick={() => { setComposeOpen(false); clearPending(); }}><X className="h-4 w-4" /></button>
            </div>
            <div className="mb-3 flex gap-2">
              {([
                { v: "public", icon: Globe, label: "Public" },
                { v: "followers", icon: Users, label: "Followers" },
                { v: "close_friends", icon: Lock, label: "Private" },
              ] as const).map(({ v, icon: Icon, label }) => (
                <button key={v} disabled={uploading} onClick={() => setVisibility(v)} className={`flex flex-1 flex-col items-center gap-1 rounded-lg p-2 text-[11px] disabled:opacity-50 ${visibility === v ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>
            <input value={caption} onChange={(e) => setCaption(e.target.value)} disabled={uploading} placeholder="Caption (optional)" className="mb-3 w-full rounded-lg bg-input px-3 py-2 text-sm outline-none disabled:opacity-50" />
            <input ref={fileRef} type="file" accept="image/*,video/*" onChange={handleFile} className="hidden" />

            {pendingPreview ? (
              <>
                <div className="relative mb-3 mx-auto aspect-[9/16] w-full max-w-[260px] overflow-hidden rounded-xl bg-black">
                  {pendingFile?.type.startsWith("video/") ? (
                    <video src={pendingPreview} controls className="h-full w-full object-contain" />
                  ) : (
                    <img src={pendingPreview} alt="Preview" className="h-full w-full object-contain" />
                  )}
                  {uploading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-white">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <p className="text-xs">Checking & uploading…</p>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button disabled={uploading} onClick={clearPending} className="flex-1 rounded-lg bg-muted py-2 text-xs font-medium disabled:opacity-50">
                    Remove
                  </button>
                  <button disabled={uploading} onClick={() => fileRef.current?.click()} className="flex-1 rounded-lg bg-muted py-2 text-xs font-medium disabled:opacity-50">
                    Change
                  </button>
                  <button disabled={uploading} onClick={confirmAndUpload} className="flex-[2] rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground disabled:opacity-50">
                    {uploading ? "Posting…" : "Post story"}
                  </button>
                </div>
              </>
            ) : (
              <button onClick={() => fileRef.current?.click()} className="w-full rounded-lg bg-primary py-2 text-sm font-bold text-primary-foreground">
                Choose photo or video
              </button>
            )}
            <p className="mt-2 text-center text-[10px] text-muted-foreground">Story expires in 24 hours · AI-moderated</p>
          </div>
        </div>
      )}

      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95" onClick={() => { setActive(null); setInsightsOpen(null); }}>
          <div onClick={(e) => e.stopPropagation()} className="relative h-full max-h-[100dvh] w-full max-w-md">
            <button onClick={() => { setActive(null); setInsightsOpen(null); }} aria-label="Close" className="absolute right-3 top-3 z-30 rounded-full bg-black/50 p-1.5 text-white"><X className="h-5 w-5" /></button>
            {(() => {
              const s = active.group[active.index];
              const isMine = user?.id === s.user_id;
              const r = reactions[s.id] || { counts: {}, rows: [] };
              const total = Object.values(r.counts).reduce((a, b) => a + b, 0);
              const viewers = viewersByStory[s.id] || [];
              return (
                <div className="relative h-full">
                  <img src={s.image_url} loading="lazy" decoding="async" className="h-full w-full object-contain" alt="" />

                  {/* Header */}
                  <div className="absolute left-3 right-12 top-3 z-20 flex items-center gap-2 text-white">
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

                  {s.caption && <div className="absolute bottom-32 left-3 right-3 z-10 rounded-lg bg-black/60 p-2 text-sm text-white">{s.caption}</div>}

                  {/* Owner insights buttons */}
                  {isMine && (
                    <div className="absolute bottom-16 left-3 right-3 z-20 flex gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); setInsightsOpen("viewers"); ensureProfiles(viewers.map((v) => v.viewer_id)); }}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-black/60 px-3 py-2 text-xs font-bold text-white backdrop-blur"
                      >
                        <Eye className="h-3.5 w-3.5" /> {viewers.length} {viewers.length === 1 ? "viewer" : "viewers"}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setInsightsOpen("reactions"); ensureProfiles(r.rows.map((row) => row.user_id)); }}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-black/60 px-3 py-2 text-xs font-bold text-white backdrop-blur"
                      >
                        <Heart className="h-3.5 w-3.5" /> {total} {total === 1 ? "reaction" : "reactions"}
                      </button>
                    </div>
                  )}

                  {/* Reactions bar */}
                  <div className="absolute bottom-3 left-3 right-3 z-20 flex items-center justify-center gap-1 rounded-full bg-black/60 p-1.5 backdrop-blur">
                    {STORY_REACTIONS.map((rx) => (
                      <button
                        key={rx.key}
                        onClick={(e) => { e.stopPropagation(); reactStory(s, rx.key); }}
                        className={`flex h-9 w-9 items-center justify-center rounded-full text-xl transition active:scale-95 hover:scale-125 ${r.mine === rx.key ? "bg-white/25" : ""}`}
                        aria-label={`React ${rx.emoji}`}
                      >
                        {rx.emoji}
                      </button>
                    ))}
                    {!isMine && total > 0 && <span className="ml-1 text-[11px] font-bold text-white">{total}</span>}
                  </div>

                  {/* Tap zones — left = previous (in-group, then prev public), center = next, right = next */}
                  <button
                    aria-label="Previous"
                    onClick={(e) => { e.stopPropagation(); goWithinGroup(-1); }}
                    className="absolute left-0 top-14 z-10 h-[55%] w-[28%]"
                  />
                  <button
                    aria-label="Next"
                    onClick={(e) => { e.stopPropagation(); goWithinGroup(1); }}
                    className="absolute left-[28%] top-14 z-10 h-[55%] w-[44%]"
                  />
                  <button
                    aria-label="Next"
                    onClick={(e) => { e.stopPropagation(); goWithinGroup(1); }}
                    className="absolute right-0 top-14 z-10 h-[55%] w-[28%]"
                  />

                  {/* Web side arrows for cross-user public navigation */}
                  <button
                    onClick={(e) => { e.stopPropagation(); goPublic(-1); }}
                    aria-label="Previous public story"
                    className="absolute -left-12 top-1/2 z-30 hidden -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80 sm:block"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); goPublic(1); }}
                    aria-label="Next public story"
                    className="absolute -right-12 top-1/2 z-30 hidden -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80 sm:block"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              );
            })()}
          </div>

          {/* Insights drawer (owner only) */}
          {insightsOpen && active && (() => {
            const s = active.group[active.index];
            const r = reactions[s.id] || { counts: {}, rows: [] };
            const viewers = viewersByStory[s.id] || [];
            return (
              <div
                className="fixed inset-x-0 bottom-0 z-40 max-h-[70vh] overflow-y-auto rounded-t-2xl bg-card p-4 shadow-2xl sm:inset-x-auto sm:right-4 sm:top-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:w-80"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setInsightsOpen("viewers")}
                      className={`rounded-full px-3 py-1 text-xs font-bold ${insightsOpen === "viewers" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                    >
                      <Eye className="mr-1 inline h-3 w-3" /> Viewers ({viewers.length})
                    </button>
                    <button
                      onClick={() => setInsightsOpen("reactions")}
                      className={`rounded-full px-3 py-1 text-xs font-bold ${insightsOpen === "reactions" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                    >
                      <Heart className="mr-1 inline h-3 w-3" /> Reactions ({r.rows.length})
                    </button>
                  </div>
                  <button onClick={() => setInsightsOpen(null)} aria-label="Close insights"><X className="h-4 w-4" /></button>
                </div>

                {insightsOpen === "reactions" && (
                  <>
                    {Object.keys(r.counts).length > 0 && (
                      <div className="mb-3 flex flex-wrap gap-1.5">
                        {STORY_REACTIONS.filter((rx) => r.counts[rx.key]).map((rx) => (
                          <span key={rx.key} className="rounded-full bg-muted px-2 py-1 text-xs">
                            {rx.emoji} {r.counts[rx.key]}
                          </span>
                        ))}
                      </div>
                    )}
                    {r.rows.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">No reactions yet</p>}
                    <ul className="space-y-2">
                      {r.rows
                        .slice()
                        .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
                        .map((row) => {
                          const p = profileMap[row.user_id];
                          const emoji = STORY_REACTIONS.find((x) => x.key === row.reaction)?.emoji || "•";
                          return (
                            <li key={row.user_id} className="flex items-center gap-2">
                              <UserRow profile={p} userId={row.user_id} onNavigate={() => { setActive(null); setInsightsOpen(null); }} />
                              <span className="text-lg">{emoji}</span>
                            </li>
                          );
                        })}
                    </ul>
                  </>
                )}

                {insightsOpen === "viewers" && (
                  <>
                    {viewers.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">No viewers yet</p>}
                    <ul className="space-y-2">
                      {viewers
                        .slice()
                        .sort((a, b) => +new Date(b.viewed_at) - +new Date(a.viewed_at))
                        .map((v) => (
                          <li key={v.viewer_id}>
                            <UserRow profile={profileMap[v.viewer_id]} userId={v.viewer_id} onNavigate={() => { setActive(null); setInsightsOpen(null); }} />
                          </li>
                        ))}
                    </ul>
                  </>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </>
  );
}

function UserRow({ profile, userId, onNavigate }: { profile?: ProfileLite; userId: string; onNavigate: () => void }) {
  const username = profile?.username || "user";
  return (
    <Link
      to="/seller/$username"
      params={{ username }}
      onClick={onNavigate}
      className="flex flex-1 items-center gap-2 rounded-lg p-1 hover:bg-muted"
    >
      <div className="h-8 w-8 overflow-hidden rounded-full bg-muted">
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} className="h-full w-full object-cover" alt="" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs font-bold">{username[0]?.toUpperCase() || "?"}</div>
        )}
      </div>
      <span className="flex-1 truncate text-sm font-medium">@{username}</span>
    </Link>
  );
}
