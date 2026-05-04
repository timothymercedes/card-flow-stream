import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { toast } from "sonner";

export const Route = createFileRoute("/feed")({ component: Feed });

function Feed() {
  const { user, profile } = useAuth();
  const nav = useNavigate();
  const [posts, setPosts] = useState<any[]>([]);
  const [caption, setCaption] = useState("");

  async function load() {
    const { data } = await supabase.from("posts").select("*").order("created_at", { ascending: false });
    setPosts(data || []);
  }
  useEffect(() => { load(); }, []);

  async function post() {
    if (!profile) return nav({ to: "/auth" });
    if (!caption.trim()) return;
    await supabase.from("posts").insert({ user_id: profile.id, username: profile.username, caption });
    setCaption("");
    load();
    toast.success("Posted!");
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
          {posts.map((p) => (
            <div key={p.id} className="rounded-xl bg-card p-3">
              <div className="text-xs font-semibold text-primary">@{p.username}</div>
              <p className="mt-1 text-sm">{p.caption}</p>
              {p.image_url && <img src={p.image_url} className="mt-2 max-h-64 w-full rounded-lg object-cover" alt="" />}
              <p className="mt-2 text-[10px] text-muted-foreground">{new Date(p.created_at).toLocaleString()}</p>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
