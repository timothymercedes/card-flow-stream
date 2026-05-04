import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/feed")({ component: Feed });

type Post = { id: string; user_id: string; username: string; caption: string; image_url: string | null; created_at: string };
type Reaction = { post_id: string; user_id: string; reaction: "like" | "dislike" };

function Feed() {
  const { user, profile } = useAuth();
  const nav = useNavigate();
  const [posts, setPosts] = useState<Post[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [caption, setCaption] = useState("");

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
          user_id: p.user_id,
          type: "reaction",
          body: `@${profile?.username} ${type === "like" ? "liked 👍" : "disliked 👎"} your post`,
          link: "/feed",
        });
      }
    }
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
            return (
              <div key={p.id} className="rounded-xl bg-card p-3">
                <div className="text-xs font-semibold text-primary">@{p.username}</div>
                <p className="mt-1 text-sm">{p.caption}</p>
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
    </AppShell>
  );
}
