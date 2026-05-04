import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Plus, X, Lock, Users, Globe } from "lucide-react";
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

export function StoryRail() {
  const { user, profile } = useAuth();
  const [stories, setStories] = useState<Story[]>([]);
  const [active, setActive] = useState<{ group: Story[]; index: number } | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [visibility, setVisibility] = useState<"public" | "followers" | "close_friends">("public");
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const { data } = await supabase
      .from("stories")
      .select("*")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    setStories((data as Story[]) || []);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("stories-rail")
      .on("postgres_changes", { event: "*", schema: "public", table: "stories" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

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
            <button key={first.user_id} onClick={() => setActive({ group: g, index: 0 })} className="flex flex-shrink-0 flex-col items-center gap-1">
              <div className="rounded-full bg-gradient-to-br from-primary to-live p-[2px]">
                <div className="h-16 w-16 overflow-hidden rounded-full bg-card">
                  {first.avatar_url ? <img src={first.avatar_url} className="h-full w-full object-cover" alt="" /> : <div className="flex h-full w-full items-center justify-center text-sm font-bold">{first.username[0]?.toUpperCase()}</div>}
                </div>
              </div>
              <span className="line-clamp-1 max-w-[64px] text-[10px]">@{first.username}</span>
            </button>
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
                { v: "close_friends", icon: Lock, label: "Close friends" },
              ] as const).map(({ v, icon: Icon, label }) => (
                <button key={v} onClick={() => setVisibility(v)} className={`flex flex-1 flex-col items-center gap-1 rounded-lg p-2 text-[11px] ${visibility === v ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>
            <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption (optional)" className="mb-3 w-full rounded-lg bg-input px-3 py-2 text-sm outline-none" />
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
            <button onClick={() => fileRef.current?.click()} disabled={uploading} className="w-full rounded-lg bg-primary py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">
              {uploading ? "Uploading..." : "Choose photo & post"}
            </button>
            <p className="mt-2 text-center text-[10px] text-muted-foreground">Story expires in 24 hours</p>
          </div>
        </div>
      )}

      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95" onClick={() => setActive(null)}>
          <div onClick={(e) => e.stopPropagation()} className="relative h-full max-h-[90vh] w-full max-w-md">
            <button onClick={() => setActive(null)} className="absolute right-3 top-3 z-10 rounded-full bg-black/50 p-1.5 text-white"><X className="h-5 w-5" /></button>
            {(() => {
              const s = active.group[active.index];
              const isMine = user?.id === s.user_id;
              return (
                <div className="relative h-full">
                  <img src={s.image_url} className="h-full w-full object-contain" alt="" />
                  <div className="absolute left-3 right-3 top-3 flex items-center gap-2 text-white">
                    <div className="h-8 w-8 overflow-hidden rounded-full bg-card">
                      {s.avatar_url && <img src={s.avatar_url} className="h-full w-full object-cover" alt="" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold">@{s.username}</p>
                      <p className="text-[10px] opacity-70">{new Date(s.created_at).toLocaleString()} · {s.visibility}</p>
                    </div>
                    {isMine && <button onClick={() => deleteStory(s)} className="rounded-full bg-black/50 px-2 py-1 text-[10px]">Delete</button>}
                  </div>
                  {s.caption && <div className="absolute bottom-6 left-3 right-3 rounded-lg bg-black/60 p-2 text-sm text-white">{s.caption}</div>}
                  {active.index > 0 && (
                    <button onClick={() => setActive({ ...active, index: active.index - 1 })} className="absolute left-0 top-0 h-full w-1/3" />
                  )}
                  {active.index < active.group.length - 1 && (
                    <button onClick={() => setActive({ ...active, index: active.index + 1 })} className="absolute right-0 top-0 h-full w-1/3" />
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
