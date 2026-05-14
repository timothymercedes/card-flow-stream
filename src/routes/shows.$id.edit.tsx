/**
 * /shows/new and /shows/$id/edit — host editor for a scheduled show.
 * Edits show meta + manages the Pre-B item list scoped to this show.
 */
import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { AuctionQueuePanel } from "@/components/AuctionQueuePanel";
import { ListingImageUpload } from "@/components/ListingImageUpload";
import { toast } from "sonner";
import { Calendar, Save, ArrowLeft, Trash2 } from "lucide-react";

export const Route = createFileRoute("/shows/$id/edit")({ component: EditShow });

function EditShow() {
  const { id } = useParams({ from: "/shows/$id/edit" });
  const { user, profile } = useAuth();
  const nav = useNavigate();
  const isNew = id === "new";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [show, setShow] = useState<any>({
    title: "",
    description: "",
    banner_url: "",
    scheduled_for: "",
    categories: [] as string[],
  });
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    if (isNew) { setLoading(false); return; }
    (async () => {
      const { data, error } = await supabase.from("scheduled_shows" as any).select("*").eq("id", id).maybeSingle();
      if (error || !data) { toast.error("Show not found"); nav({ to: "/profile" }); return; }
      if ((data as any).seller_id !== user.id) { toast.error("Not your show"); nav({ to: "/profile" }); return; }
      setShow({
        ...data,
        scheduled_for: new Date((data as any).scheduled_for).toISOString().slice(0, 16),
      });
      setLoading(false);
    })();
  }, [id, user]);

  async function save() {
    if (!user) return toast.error("Sign in first");
    const title = String(show.title || "").trim();
    if (!title) return toast.error("Title required");
    if (!show.scheduled_for) return toast.error("Pick a date/time");
    setSaving(true);

    const payload: any = {
      title,
      description: show.description || null,
      banner_url: show.banner_url || null,
      scheduled_for: new Date(show.scheduled_for).toISOString(),
      categories: show.categories || [],
    };

    if (isNew) {
      payload.seller_id = user.id;
      payload.seller_username = profile?.username || "host";
      const { data, error } = await supabase.from("scheduled_shows" as any).insert(payload).select("id").single();
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Show scheduled");
      nav({ to: "/shows/$id/edit", params: { id: (data as any).id } });
      return;
    }

    const { error } = await supabase.from("scheduled_shows" as any).update(payload).eq("id", id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
  }

  async function deleteShow() {
    if (!confirm("Delete this scheduled show? Pre-B items will be removed too.")) return;
    const { error } = await supabase.from("scheduled_shows" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    nav({ to: "/profile" });
  }

  function addTag() {
    const t = tagInput.trim().toLowerCase();
    if (!t) return;
    if ((show.categories || []).includes(t)) return;
    setShow((s: any) => ({ ...s, categories: [...(s.categories || []), t] }));
    setTagInput("");
  }
  function removeTag(t: string) {
    setShow((s: any) => ({ ...s, categories: (s.categories || []).filter((x: string) => x !== t) }));
  }

  if (!user) return <AppShell><div className="p-8 text-center text-sm">Sign in to edit shows.</div></AppShell>;
  if (loading) return <AppShell><div className="p-8 text-center text-sm text-muted-foreground">Loading…</div></AppShell>;

  return (
    <AppShell>
      <div className="space-y-4 px-4 py-5">
        <div className="flex items-center gap-2">
          <Link to="/profile" className="rounded-full bg-muted p-2"><ArrowLeft className="h-4 w-4" /></Link>
          <h1 className="flex items-center gap-2 text-lg font-bold">
            <Calendar className="h-5 w-5 text-fuchsia-500" />
            {isNew ? "Schedule a Show" : "Edit Scheduled Show"}
          </h1>
        </div>

        <div className="space-y-2 rounded-xl bg-card p-3 ring-1 ring-border">
          <label className="block">
            <span className="text-[10px] font-bold uppercase text-muted-foreground">Title</span>
            <input value={show.title} onChange={(e) => setShow((s: any) => ({ ...s, title: e.target.value }))}
              className="mt-1 w-full rounded-md bg-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </label>
          <label className="block">
            <span className="text-[10px] font-bold uppercase text-muted-foreground">Description</span>
            <textarea value={show.description || ""} onChange={(e) => setShow((s: any) => ({ ...s, description: e.target.value }))}
              rows={3} className="mt-1 w-full rounded-md bg-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </label>
          <label className="block">
            <span className="text-[10px] font-bold uppercase text-muted-foreground">Date & Time</span>
            <input type="datetime-local" value={show.scheduled_for}
              onChange={(e) => setShow((s: any) => ({ ...s, scheduled_for: e.target.value }))}
              className="mt-1 w-full rounded-md bg-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </label>
          <ListingImageUpload value={show.banner_url || ""} onChange={(u) => setShow((s: any) => ({ ...s, banner_url: u }))} label="Banner" />

          <div>
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Categories / Tags</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {(show.categories || []).map((t: string) => (
                <button key={t} onClick={() => removeTag(t)} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold">
                  #{t} ✕
                </button>
              ))}
            </div>
            <div className="mt-1 flex gap-1">
              <input value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                placeholder="add tag…" className="flex-1 rounded-md bg-input px-2 py-1 text-xs focus:outline-none" />
              <button onClick={addTag} className="rounded-md bg-primary px-2 py-1 text-xs font-bold text-primary-foreground">Add</button>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={saving}
              className="flex flex-1 items-center justify-center gap-1 rounded-md bg-emerald-500 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">
              <Save className="h-4 w-4" /> {saving ? "Saving…" : isNew ? "Create show" : "Save changes"}
            </button>
            {!isNew && (
              <button onClick={deleteShow}
                className="flex items-center gap-1 rounded-md bg-destructive px-3 py-2 text-sm font-bold text-destructive-foreground">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {!isNew && (
          <div>
            <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wider text-muted-foreground">
              Pre-B Items for This Show
            </h2>
            {/* Use the show id as a synthetic stream id so items are scoped to this show
                until it goes live and inherits the real stream_id. */}
            <AuctionQueuePanel
              streamId={id}
              hostId={user.id}
              isHost
              auctionLive={false}
              scheduledShowId={id}
            />
          </div>
        )}
      </div>
    </AppShell>
  );
}
