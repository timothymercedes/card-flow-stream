import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Plus, X, ChevronLeft, ChevronRight, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { StoryViewer } from "@/components/StoryViewer";
import { signStories, type Story } from "@/lib/stories";

type H = { id: string; title: string; cover_story_id: string | null; position: number; items: string[] };

/** Permanent highlight circles under a profile bio; owners can create, edit, reorder and delete. */
export function StoryHighlights({ userId }: { userId: string }) {
  const { user } = useAuth();
  const owner = user?.id === userId;
  const [list, setList] = useState<H[]>([]);
  const [media, setMedia] = useState<Record<string, Story>>({});
  const [view, setView] = useState<Story[] | null>(null);
  const [edit, setEdit] = useState<H | "new" | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("story_highlights").select("id,title,cover_story_id,position,story_highlight_items(story_id,position,added_at)").eq("user_id", userId).order("position");
    const hs: H[] = (data || []).map((h: any) => ({ ...h, items: [...(h.story_highlight_items || [])].sort((a: any, b: any) => a.position - b.position || +new Date(a.added_at) - +new Date(b.added_at)).map((i: any) => i.story_id) }));
    const ids = [...new Set(hs.flatMap((h) => h.items))];
    const { data: rows } = ids.length ? await supabase.from("stories").select("*").in("id", ids) : { data: [] };
    const signed = await signStories(rows || []);
    setMedia(Object.fromEntries(signed.map((s) => [s.id, s])));
    setList(hs);
  }, [userId]);
  useEffect(() => { void load(); }, [load]);

  const visible = list.filter((h) => owner || h.items.some((id) => media[id]));
  if (!owner && !visible.length) return null;

  async function move(h: H, d: -1 | 1) {
    const i = list.indexOf(h), j = i + d; if (j < 0 || j >= list.length) return;
    const next = [...list]; [next[i], next[j]] = [next[j]!, next[i]!];
    setList(next);
    await Promise.all(next.map((x, k) => supabase.from("story_highlights").update({ position: k }).eq("id", x.id)));
  }
  async function del(h: H) {
    if (!confirm(`Delete highlight "${h.title}"? The stories stay in your archive.`)) return;
    const { error } = await supabase.from("story_highlights").delete().eq("id", h.id);
    if (error) return toast.error(error.message);
    void load();
  }

  return (
    <div className="my-4">
      <div className="flex gap-4 overflow-x-auto pb-2" role="list" aria-label="Story highlights">
        {visible.map((h) => {
          const cover = media[h.cover_story_id || ""] || media[h.items.find((id) => media[id]) || ""];
          return (
            <div key={h.id} role="listitem" className="flex flex-shrink-0 flex-col items-center gap-1">
              <button aria-label={`Open highlight ${h.title}`} onClick={() => { const s = h.items.map((id) => media[id]).filter(Boolean) as Story[]; if (s.length) setView(s); else toast("This highlight is empty"); }}
                className="h-16 w-16 overflow-hidden rounded-full border-2 border-border bg-muted p-0.5">
                {cover ? (cover.media_type === "video" ? <video src={cover.image_url} muted className="h-full w-full rounded-full object-cover" /> : <img src={cover.image_url} alt="" className="h-full w-full rounded-full object-cover" />) : <span className="flex h-full items-center justify-center text-lg font-bold">{h.title[0]}</span>}
              </button>
              <span className="max-w-[72px] truncate text-[11px] font-medium">{h.title}</span>
              {owner && <div className="flex gap-0.5 text-muted-foreground">
                <button aria-label={`Move ${h.title} left`} onClick={() => move(h, -1)}><ChevronLeft className="h-3.5 w-3.5" /></button>
                <button aria-label={`Edit ${h.title}`} onClick={() => setEdit(h)}><Pencil className="h-3 w-3" /></button>
                <button aria-label={`Delete ${h.title}`} onClick={() => del(h)}><Trash2 className="h-3 w-3" /></button>
                <button aria-label={`Move ${h.title} right`} onClick={() => move(h, 1)}><ChevronRight className="h-3.5 w-3.5" /></button>
              </div>}
            </div>
          );
        })}
        {owner && (
          <div role="listitem" className="flex flex-shrink-0 flex-col items-center gap-1">
            <button aria-label="New highlight" onClick={() => setEdit("new")} className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-border"><Plus className="h-6 w-6" /></button>
            <span className="text-[11px]">New</span>
          </div>
        )}
      </div>
      {view && <StoryViewer groups={[view]} start={{ group: 0, index: 0 }} onClose={() => setView(null)} onChanged={load} />}
      {edit && <HighlightEditor userId={userId} highlight={edit === "new" ? null : edit} count={list.length} onClose={() => setEdit(null)} onSaved={load} />}
    </div>
  );
}

function HighlightEditor({ userId, highlight, count, onClose, onSaved }: { userId: string; highlight: H | null; count: number; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(highlight?.title || "");
  const [picked, setPicked] = useState<string[]>(highlight?.items || []);
  const [cover, setCover] = useState<string | null>(highlight?.cover_story_id || null);
  const [mine, setMine] = useState<Story[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void (async () => {
    // owner can read every non-deleted story of theirs, active or expired
    const { data } = await supabase.from("stories").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(120);
    setMine(await signStories(data || []));
  })(); }, [userId]);

  async function save() {
    const t = title.trim(); if (!t) return toast.error("Name your highlight");
    if (!picked.length) return toast.error("Pick at least one story");
    setBusy(true);
    try {
      const c = cover && picked.includes(cover) ? cover : picked[0]!;
      let id = highlight?.id;
      if (id) { const { error } = await supabase.from("story_highlights").update({ title: t.slice(0, 30), cover_story_id: c }).eq("id", id); if (error) throw error; }
      else { const { data, error } = await supabase.from("story_highlights").insert({ user_id: userId, title: t.slice(0, 30), cover_story_id: c, position: count }).select("id").single(); if (error) throw error; id = data.id; }
      const removed = (highlight?.items || []).filter((x) => !picked.includes(x));
      if (removed.length) { const { error } = await supabase.from("story_highlight_items").delete().eq("highlight_id", id!).in("story_id", removed); if (error) throw error; }
      const { error } = await supabase.from("story_highlight_items").upsert(picked.map((story_id, position) => ({ highlight_id: id!, story_id, position })), { onConflict: "highlight_id,story_id" });
      if (error) throw error;
      toast.success("Highlight saved"); onSaved(); onClose();
    } catch (e: any) { toast.error(e?.message || "Could not save"); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/70 sm:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Edit highlight" className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-card p-4 sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between"><p className="font-bold">{highlight ? "Edit highlight" : "New highlight"}</p><button aria-label="Close" onClick={onClose}><X className="h-5 w-5" /></button></div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={30} placeholder="Highlight name" aria-label="Highlight name" className="mb-3 w-full rounded-lg bg-input px-3 py-2 text-sm outline-none" />
        <p className="mb-2 text-xs text-muted-foreground">Tap stories to add or remove. Tap ★ to make one the cover.</p>
        {mine.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">Post a story first — expired ones show here too.</p>}
        <div className="grid grid-cols-4 gap-1.5">
          {mine.map((s) => { const on = picked.includes(s.id); return (
            <div key={s.id} className="relative aspect-[9/16] overflow-hidden rounded-md bg-black">
              <button aria-pressed={on} aria-label={on ? "Remove story" : "Add story"} onClick={() => setPicked((p) => (on ? p.filter((x) => x !== s.id) : [...p, s.id]))} className="h-full w-full">
                {s.media_type === "video" ? <video src={s.image_url} muted className="h-full w-full object-cover" /> : <img src={s.image_url} alt="" className="h-full w-full object-cover" />}
              </button>
              {on && <span className="pointer-events-none absolute left-1 top-1 rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">{picked.indexOf(s.id) + 1}</span>}
              {on && <button aria-label="Use as cover" onClick={() => setCover(s.id)} className={`absolute bottom-1 right-1 rounded-full px-1 text-xs ${cover === s.id ? "bg-primary text-primary-foreground" : "bg-black/60 text-white"}`}>★</button>}
            </div>
          ); })}
        </div>
        <button onClick={save} disabled={busy} className="mt-4 w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">{busy ? "Saving…" : "Save highlight"}</button>
      </div>
    </div>
  );
}
