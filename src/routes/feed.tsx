import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { Pencil, Trash2, History, X, Check, Sparkles, Plus } from "lucide-react";
import { toast } from "sonner";
import { StoryRail } from "@/components/StoryRail";
import { LISTING_CATEGORIES, categoryEmoji, categoryLabel } from "@/lib/listingCategories";

export const Route = createFileRoute("/feed")({ component: Feed });

const REACTIONS = [
  { key: "like", emoji: "👍", label: "Like" },
  { key: "dislike", emoji: "👎", label: "Dislike" },
  { key: "love", emoji: "❤️", label: "Love" },
  { key: "fire", emoji: "🔥", label: "Fire" },
  { key: "laugh", emoji: "😂", label: "Funny" },
  { key: "wow", emoji: "😮", label: "Wow" },
  { key: "clap", emoji: "👏", label: "Clap" },
  { key: "money", emoji: "💯", label: "100" },
] as const;

type Post = { id: string; user_id: string; username: string; caption: string; image_url: string | null; created_at: string };
type Reaction = { post_id: string; user_id: string; reaction: string };
type Edit = { id: string; post_id: string; prev_caption: string | null; prev_image_url: string | null; action: string; edited_at: string };
type HypePost = { id: string; title: string; body: string; category: string | null; image_url: string | null; created_at: string; source: string };

function Feed() {
  const { user, profile } = useAuth();
  const nav = useNavigate();
  const [posts, setPosts] = useState<Post[]>([]);
  const [hype, setHype] = useState<HypePost[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [caption, setCaption] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [historyFor, setHistoryFor] = useState<Post | null>(null);
  const [history, setHistory] = useState<Edit[]>([]);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "stories" | "drops">("all");
  const [isAdmin, setIsAdmin] = useState(false);
  const [generating, setGenerating] = useState(false);

  async function load() {
    const [{ data: ps }, { data: rs }, { data: hs }] = await Promise.all([
      supabase.from("posts").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("post_reactions").select("post_id,user_id,reaction"),
      supabase.from("ai_hype_posts").select("*").order("created_at", { ascending: false }).limit(20),
    ]);
    setPosts((ps as Post[]) || []);
    setReactions((rs as Reaction[]) || []);
    setHype((hs as HypePost[]) || []);
  }

  useEffect(() => {
    load();
    const ch = supabase.channel("feed-all")
      .on("postgres_changes", { event: "*", schema: "public", table: "post_reactions" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_hype_posts" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    supabase.rpc("has_role", { _user_id: user.id, _role: "admin" } as any)
      .then(({ data }) => setIsAdmin(!!data));
  }, [user]);

  async function post() {
    if (!profile) return nav({ to: "/auth" });
    if (!caption.trim()) return;
    await supabase.from("posts").insert({ user_id: profile.id, username: profile.username, caption });
    setCaption("");
    load();
    toast.success("Posted!");
  }

  async function react(p: Post, type: string) {
    if (!user) return nav({ to: "/auth" });
    setPickerFor(null);
    const mine = reactions.find((r) => r.post_id === p.id && r.user_id === user.id);
    if (mine?.reaction === type) {
      await supabase.from("post_reactions").delete().eq("post_id", p.id).eq("user_id", user.id);
    } else if (mine) {
      await supabase.from("post_reactions").update({ reaction: type }).eq("post_id", p.id).eq("user_id", user.id);
    } else {
      await supabase.from("post_reactions").insert({ post_id: p.id, user_id: user.id, reaction: type });
      if (p.user_id !== user.id) {
        const emoji = REACTIONS.find((r) => r.key === type)?.emoji || "👍";
        await supabase.from("notifications").insert({
          user_id: p.user_id, type: "reaction",
          body: `@${profile?.username} reacted ${emoji} to your post`,
          link: "/feed",
        });
      }
    }
  }

  async function saveEdit(p: Post) {
    if (!user || user.id !== p.user_id) return;
    if (!editText.trim()) return toast.error("Caption required");
    await supabase.from("post_edits").insert({
      post_id: p.id, user_id: user.id,
      prev_caption: p.caption, prev_image_url: p.image_url, action: "edit",
    });
    await supabase.from("posts").update({ caption: editText }).eq("id", p.id);
    setEditingId(null);
    toast.success("Updated");
    load();
  }

  async function remove(p: Post) {
    if (!user || user.id !== p.user_id) return;
    if (!confirm("Delete this post?")) return;
    await supabase.from("post_edits").insert({
      post_id: p.id, user_id: user.id,
      prev_caption: p.caption, prev_image_url: p.image_url, action: "delete",
    });
    await supabase.from("posts").delete().eq("id", p.id);
    toast.success("Deleted");
    load();
  }

  async function openHistory(p: Post) {
    setHistoryFor(p);
    const { data } = await supabase.from("post_edits").select("*").eq("post_id", p.id).order("edited_at", { ascending: false });
    setHistory((data as Edit[]) || []);
  }

  async function generateHype() {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-hype-post", { body: {} });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Hype post generated! ✨");
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to generate");
    } finally {
      setGenerating(false);
    }
  }

  async function deleteHype(id: string) {
    if (!confirm("Delete this hype post?")) return;
    const { error } = await supabase.from("ai_hype_posts").delete().eq("id", id);
    if (error) toast.error(error.message); else load();
  }

  function counts(postId: string) {
    const list = reactions.filter((r) => r.post_id === postId);
    const map: Record<string, number> = {};
    list.forEach((r) => { map[r.reaction] = (map[r.reaction] || 0) + 1; });
    const mine = user ? list.find((r) => r.user_id === user.id)?.reaction : undefined;
    const total = list.length;
    return { map, mine, total };
  }

  // Personalized merge: interleave posts + AI hype, filter by user interests if any
  const interests = profile?.interests as string[] | undefined;
  const merged = useMemo(() => {
    const items: Array<{ kind: "post"; data: Post } | { kind: "hype"; data: HypePost }> = [];
    if (filter !== "drops") posts.forEach((p) => items.push({ kind: "post", data: p }));
    if (filter !== "stories") {
      let h = hype;
      if (interests && interests.length > 0) {
        const matched = h.filter((x) => x.category && interests.includes(x.category));
        if (matched.length > 0) h = matched;
      }
      h.forEach((p) => items.push({ kind: "hype", data: p }));
    }
    items.sort((a, b) => new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime());
    return items;
  }, [posts, hype, filter, interests]);

  return (
    <AppShell>
      <div className="px-4 py-4">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Feed</h1>
          {isAdmin && (
            <button onClick={generateHype} disabled={generating}
              className="flex items-center gap-1 rounded-full bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary disabled:opacity-50">
              <Sparkles className="h-3.5 w-3.5" /> {generating ? "..." : "AI Hype"}
            </button>
          )}
        </div>

        <StoryRail />

        <div className="mb-3 flex gap-2 overflow-x-auto">
          {(["all", "stories", "drops"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${filter === f ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
              {f === "all" ? "All" : f === "stories" ? "Posts" : "🔥 Drops"}
            </button>
          ))}
        </div>

        <div className="mb-4 rounded-xl bg-card p-3">
          <textarea value={caption} onChange={(e) => setCaption(e.target.value)} placeholder={user ? "Share an update..." : "Sign in to post"} disabled={!user} rows={2} className="w-full resize-none rounded-lg bg-input px-3 py-2 text-sm outline-none disabled:opacity-50" />
          <button onClick={post} disabled={!user || !caption.trim()} className="mt-2 w-full rounded-lg bg-primary py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">Post</button>
        </div>

        {merged.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">Nothing yet</p>}
        <div className="space-y-3">
          {merged.map((item) => {
            if (item.kind === "hype") {
              const h = item.data;
              return (
                <div key={"h-" + h.id} className="relative overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 to-live/5 p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                      <Sparkles className="h-3 w-3" /> AI Drop Alert {h.category && `· ${categoryEmoji(h.category)} ${categoryLabel(h.category)}`}
                    </div>
                    {isAdmin && (
                      <button onClick={() => deleteHype(h.id)} className="rounded-full p-1 text-muted-foreground hover:bg-muted">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <p className="text-sm font-bold">{h.title}</p>
                  <p className="mt-1 text-sm">{h.body}</p>
                  <p className="mt-2 text-[10px] text-muted-foreground">{new Date(h.created_at).toLocaleString()}</p>
                </div>
              );
            }
            const p = item.data;
            const c = counts(p.id);
            const mine = user?.id === p.user_id;
            const isEditing = editingId === p.id;
            const topReactions = Object.entries(c.map).sort((a, b) => b[1] - a[1]).slice(0, 3);
            return (
              <div key={p.id} className="relative rounded-xl bg-card p-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-primary">@{p.username}</div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openHistory(p)} className="rounded-full p-1 text-muted-foreground hover:bg-muted" title="History"><History className="h-3.5 w-3.5" /></button>
                    {mine && !isEditing && (
                      <>
                        <button onClick={() => { setEditingId(p.id); setEditText(p.caption); }} className="rounded-full p-1 text-muted-foreground hover:bg-muted"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => remove(p)} className="rounded-full p-1 text-muted-foreground hover:bg-muted"><Trash2 className="h-3.5 w-3.5" /></button>
                      </>
                    )}
                  </div>
                </div>
                {isEditing ? (
                  <div className="mt-1">
                    <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={2} className="w-full resize-none rounded-lg bg-input px-3 py-2 text-sm outline-none" />
                    <div className="mt-2 flex gap-2">
                      <button onClick={() => saveEdit(p)} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-primary py-1.5 text-xs font-bold text-primary-foreground"><Check className="h-3 w-3" /> Save</button>
                      <button onClick={() => setEditingId(null)} className="rounded-lg bg-muted px-3 py-1.5 text-xs"><X className="h-3 w-3" /></button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 text-sm">{p.caption}</p>
                )}
                {p.image_url && <img src={p.image_url} className="mt-2 max-h-64 w-full rounded-lg object-cover" alt="" />}
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-[10px] text-muted-foreground">{new Date(p.created_at).toLocaleString()}</p>
                  <div className="flex items-center gap-1">
                    {topReactions.length > 0 && (
                      <div className="flex items-center gap-0.5 rounded-full bg-muted px-2 py-1 text-xs">
                        {topReactions.map(([k]) => <span key={k}>{REACTIONS.find((r) => r.key === k)?.emoji}</span>)}
                        <span className="ml-1 text-[10px] font-semibold text-muted-foreground">{c.total}</span>
                      </div>
                    )}
                    <button onClick={() => setPickerFor(pickerFor === p.id ? null : p.id)}
                      className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs ${c.mine ? "bg-primary/20 text-primary" : "bg-muted"}`}>
                      {c.mine ? REACTIONS.find((r) => r.key === c.mine)?.emoji : <Plus className="h-3 w-3" />}
                      <span>React</span>
                    </button>
                  </div>
                </div>

                {pickerFor === p.id && (
                  <>
                    <button onClick={() => setPickerFor(null)} className="fixed inset-0 z-30 bg-transparent" aria-label="close" />
                    <div className="absolute bottom-12 right-3 z-40 flex gap-1 rounded-full border border-border bg-card p-1.5 shadow-lg">
                      {REACTIONS.map((r) => (
                        <button key={r.key} onClick={() => react(p, r.key)}
                          title={r.label}
                          className={`flex h-9 w-9 items-center justify-center rounded-full text-xl transition hover:scale-125 ${c.mine === r.key ? "bg-primary/20" : ""}`}>
                          {r.emoji}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {historyFor && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={() => setHistoryFor(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-bold">Post history</p>
              <button onClick={() => setHistoryFor(null)}><X className="h-4 w-4" /></button>
            </div>
            <div className="mb-2 rounded-lg bg-muted/40 p-2 text-xs">
              <p className="text-[10px] text-muted-foreground">Current</p>
              <p>{historyFor.caption}</p>
            </div>
            {history.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">No prior versions</p>}
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {history.map((h) => (
                <div key={h.id} className="rounded-lg bg-muted/20 p-2 text-xs">
                  <p className="text-[10px] text-muted-foreground">{h.action} • {new Date(h.edited_at).toLocaleString()}</p>
                  <p className="mt-1 line-clamp-3">{h.prev_caption}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
