import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { ThumbsUp, ThumbsDown, Pencil, Trash2, History, X, Check } from "lucide-react";
import { toast } from "sonner";
import { StoryRail } from "@/components/StoryRail";

export const Route = createFileRoute("/feed")({ component: Feed });

type Post = { id: string; user_id: string; username: string; caption: string; image_url: string | null; created_at: string };
type Reaction = { post_id: string; user_id: string; reaction: "like" | "dislike" };
type Edit = { id: string; post_id: string; prev_caption: string | null; prev_image_url: string | null; action: string; edited_at: string };

function Feed() {
  const { user, profile } = useAuth();
  const nav = useNavigate();
  const [posts, setPosts] = useState<Post[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [caption, setCaption] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [historyFor, setHistoryFor] = useState<Post | null>(null);
  const [history, setHistory] = useState<Edit[]>([]);

  async function load() {
    const [{ data: ps }, { data: rs }] = await Promise.all([
      supabase.from("posts").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("post_reactions").select("post_id,user_id,reaction"),
    ]);
    setPosts((ps as Post[]) || []);
    setReactions((rs as Reaction[]) || []);
  }
  useEffect(() => {
    load();
    const ch = supabase.channel("feed-reactions")
      .on("postgres_changes", { event: "*", schema: "public", table: "post_reactions" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function post() {
    if (!profile) return nav({ to: "/auth" });
    if (!caption.trim()) return;
    await supabase.from("posts").insert({ user_id: profile.id, username: profile.username, caption });
    setCaption("");
    load();
    toast.success("Posted!");
  }

  async function react(p: Post, type: "like" | "dislike") {
    if (!user) return nav({ to: "/auth" });
    const mine = reactions.find((r) => r.post_id === p.id && r.user_id === user.id);
    if (mine?.reaction === type) {
      await supabase.from("post_reactions").delete().eq("post_id", p.id).eq("user_id", user.id);
    } else if (mine) {
      await supabase.from("post_reactions").update({ reaction: type }).eq("post_id", p.id).eq("user_id", user.id);
    } else {
      await supabase.from("post_reactions").insert({ post_id: p.id, user_id: user.id, reaction: type });
      if (p.user_id !== user.id) {
        await supabase.from("notifications").insert({
          user_id: p.user_id, type: "reaction",
          body: `@${profile?.username} ${type === "like" ? "liked 👍" : "disliked 👎"} your post`,
          link: "/feed",
        });
      }
    }
  }

  async function saveEdit(p: Post) {
    if (!user || user.id !== p.user_id) return;
    if (!editText.trim()) return toast.error("Caption required");
    // Save history snapshot first
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
    if (!confirm("Delete this post? An audit record is kept.")) return;
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

  function counts(postId: string) {
    const likes = reactions.filter((r) => r.post_id === postId && r.reaction === "like").length;
    const dislikes = reactions.filter((r) => r.post_id === postId && r.reaction === "dislike").length;
    const mine = user ? reactions.find((r) => r.post_id === postId && r.user_id === user.id)?.reaction : undefined;
    return { likes, dislikes, mine };
  }

  return (
    <AppShell>
      <div className="px-4 py-4">
        <h1 className="mb-4 text-2xl font-bold">Status Feed</h1>
        <div className="mb-4 rounded-xl bg-card p-3">
          <textarea value={caption} onChange={(e) => setCaption(e.target.value)} placeholder={user ? "Share an update..." : "Sign in to post"} disabled={!user} rows={2} className="w-full resize-none rounded-lg bg-input px-3 py-2 text-sm outline-none disabled:opacity-50" />
          <button onClick={post} disabled={!user || !caption.trim()} className="mt-2 w-full rounded-lg bg-primary py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">Post</button>
        </div>

        {posts.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">No posts yet</p>}
        <div className="space-y-3">
          {posts.map((p) => {
            const c = counts(p.id);
            const mine = user?.id === p.user_id;
            const isEditing = editingId === p.id;
            return (
              <div key={p.id} className="rounded-xl bg-card p-3">
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
                  <div className="flex gap-2">
                    <button onClick={() => react(p, "like")} className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs ${c.mine === "like" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                      <ThumbsUp className="h-3 w-3" /> {c.likes}
                    </button>
                    <button onClick={() => react(p, "dislike")} className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs ${c.mine === "dislike" ? "bg-destructive text-destructive-foreground" : "bg-muted text-foreground"}`}>
                      <ThumbsDown className="h-3 w-3" /> {c.dislikes}
                    </button>
                  </div>
                </div>
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
