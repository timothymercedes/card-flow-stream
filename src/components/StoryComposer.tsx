import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { X, Globe, Users, Lock, Camera, ImagePlus, Type, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { MAX_STORY_ITEMS, MAX_VIDEO_SECONDS, STORY_STICKERS, type StoryOverlay } from "@/lib/stories";

type Item = { file: File; url: string; video: boolean; overlays: StoryOverlay[]; status: "ready" | "uploading" | "done" | "failed" };
const VIS = [
  { v: "public", icon: Globe, label: "Public" },
  { v: "followers", icon: Users, label: "Followers" },
  { v: "close_friends", icon: Lock, label: "Close friends" },
] as const;

function videoSeconds(url: string) {
  return new Promise<number>((res) => { const v = document.createElement("video"); v.preload = "metadata"; v.onloadedmetadata = () => res(v.duration || 0); v.onerror = () => res(0); v.src = url; });
}

export function StoryComposer({ onClose, onPosted }: { onClose: () => void; onPosted: () => void }) {
  const { user, profile } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [sel, setSel] = useState(0);
  const [visibility, setVisibility] = useState<(typeof VIS)[number]["v"]>("public");
  const [caption, setCaption] = useState("");
  const [tool, setTool] = useState<{ kind: "text" | "sticker"; value: string } | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  useEffect(() => () => items.forEach((i) => URL.revokeObjectURL(i.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  async function add(files: FileList | null) {
    if (!files) return;
    const room = MAX_STORY_ITEMS - items.length;
    const picked = [...files].slice(0, room);
    if (files.length > room) toast.error(`Up to ${MAX_STORY_ITEMS} photos or videos per story`);
    const next: Item[] = [];
    for (const f of picked) {
      const video = f.type.startsWith("video/");
      if (!video && !f.type.startsWith("image/")) { toast.error(`${f.name}: not a photo or video`); continue; }
      if (f.size > 50 * 1024 * 1024) { toast.error(`${f.name}: larger than 50 MB`); continue; }
      const url = URL.createObjectURL(f);
      if (video && (await videoSeconds(url)) > MAX_VIDEO_SECONDS + 0.5) { toast.error(`${f.name}: videos can be up to ${MAX_VIDEO_SECONDS} seconds`); URL.revokeObjectURL(url); continue; }
      next.push({ file: f, url, video, overlays: [], status: "ready" });
    }
    setItems((cur) => { if (!cur.length && next.length) setSel(0); return [...cur, ...next]; });
    if (gallery.current) gallery.current.value = ""; if (camera.current) camera.current.value = "";
  }
  function place(e: React.MouseEvent<HTMLDivElement>) {
    if (!tool || !items[sel]) return;
    const r = e.currentTarget.getBoundingClientRect();
    const o: StoryOverlay = { ...tool, x: Math.round(((e.clientX - r.left) / r.width) * 100), y: Math.round(((e.clientY - r.top) / r.height) * 100) };
    setItems((c) => c.map((it, i) => (i === sel ? { ...it, overlays: [...it.overlays, o].slice(0, 12) } : it)));
    setTool(null); setText("");
  }
  function removeItem(i: number) {
    URL.revokeObjectURL(items[i]!.url);
    setItems((c) => c.filter((_, j) => j !== i)); setSel((s) => Math.max(0, Math.min(s, items.length - 2)));
  }

  async function post() {
    if (!user || !profile || !items.length) return;
    setBusy(true);
    const sequence = items.length > 1 ? crypto.randomUUID() : null;
    let ok = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i]!;
      if (it.status === "done") { ok++; continue; }
      setItems((c) => c.map((x, j) => (j === i ? { ...x, status: "uploading" } : x)));
      try {
        const ext = (it.file.name.split(".").pop() || (it.video ? "mp4" : "jpg")).toLowerCase().replace(/[^a-z0-9]/g, "");
        const path = `${user.id}/${Date.now()}-${i}.${ext}`;
        const { error: upErr } = await supabase.storage.from("stories").upload(path, it.file, { contentType: it.file.type });
        if (upErr) throw upErr;
        if (!it.video) {
          try {
            const { data: link } = await supabase.storage.from("stories").createSignedUrl(path, 600);
            const { data: mod } = await supabase.functions.invoke("moderate-image", { body: { image_url: link?.signedUrl } });
            if (mod && (mod as any).allowed === false) { await supabase.storage.from("stories").remove([path]); throw new Error(`Blocked: ${(mod as any).reason || "inappropriate content"}`); }
          } catch (e: any) { if (String(e?.message).startsWith("Blocked")) throw e; }
        }
        const { data: pub } = supabase.storage.from("stories").getPublicUrl(path);
        const { error } = await supabase.from("stories").insert({
          user_id: user.id, username: profile.username, avatar_url: profile.avatar_url, image_url: pub.publicUrl,
          caption: i === 0 && caption.trim() ? caption.trim().slice(0, 300) : null, visibility,
          media_type: it.video ? "video" : "image", sequence_id: sequence, overlays: it.overlays as any,
        });
        if (error) throw error;
        ok++;
        setItems((c) => c.map((x, j) => (j === i ? { ...x, status: "done" } : x)));
      } catch (e: any) {
        toast.error(e?.message || "Upload failed");
        setItems((c) => c.map((x, j) => (j === i ? { ...x, status: "failed" } : x)));
      }
    }
    setBusy(false);
    if (ok === items.length) { toast.success(ok > 1 ? `Story posted (${ok} parts)` : "Story posted"); onPosted(); onClose(); }
    else if (ok) { onPosted(); toast.error("Some parts failed — tap Post again to retry them"); }
  }

  const cur = items[sel];
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/80 sm:items-center" onClick={() => !busy && onClose()}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[100dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-card p-4 sm:rounded-2xl" role="dialog" aria-label="New story">
        <div className="mb-3 flex items-center justify-between"><p className="font-bold">New story</p><button aria-label="Close" disabled={busy} onClick={onClose}><X className="h-5 w-5" /></button></div>
        <input ref={gallery} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => void add(e.target.files)} data-testid="story-files" />
        <input ref={camera} type="file" accept="image/*,video/*" capture="environment" className="hidden" onChange={(e) => void add(e.target.files)} />

        {!cur ? (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => camera.current?.click()} className="flex flex-col items-center gap-2 rounded-xl bg-muted p-6 text-sm font-bold"><Camera className="h-6 w-6" />Camera</button>
            <button onClick={() => gallery.current?.click()} className="flex flex-col items-center gap-2 rounded-xl bg-primary p-6 text-sm font-bold text-primary-foreground"><ImagePlus className="h-6 w-6" />Photos & videos</button>
            <p className="col-span-2 text-center text-[11px] text-muted-foreground">Pick up to {MAX_STORY_ITEMS} at once · videos up to {MAX_VIDEO_SECONDS}s</p>
          </div>
        ) : (<>
          <div onClick={place} className={`relative mx-auto mb-2 aspect-[9/16] w-full max-w-[250px] overflow-hidden rounded-xl bg-black ${tool ? "cursor-crosshair ring-2 ring-primary" : ""}`}>
            {cur.video ? <video src={cur.url} muted loop autoPlay playsInline className="pointer-events-none h-full w-full object-contain" /> : <img src={cur.url} alt="Story part preview" className="pointer-events-none h-full w-full object-contain" />}
            {cur.overlays.map((o, i) => <span key={i} className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 ${o.kind === "sticker" ? "text-3xl" : "max-w-[85%] rounded bg-black/55 px-2 py-1 text-center text-sm font-bold text-white"}`} style={{ left: `${o.x}%`, top: `${o.y}%` }}>{o.value}</span>)}
            {tool && <span className="absolute inset-x-0 top-2 text-center text-[11px] font-bold text-white drop-shadow">Tap where to place it</span>}
          </div>
          <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
            {items.map((it, i) => (
              <div key={it.url} className="relative flex-shrink-0">
                <button onClick={() => setSel(i)} aria-label={`Part ${i + 1}`} className={`h-14 w-10 overflow-hidden rounded-md bg-black ${i === sel ? "ring-2 ring-primary" : ""}`}>
                  {it.video ? <video src={it.url} muted className="h-full w-full object-cover" /> : <img src={it.url} alt="" className="h-full w-full object-cover" />}
                </button>
                {it.status === "uploading" && <Loader2 className="absolute inset-0 m-auto h-4 w-4 animate-spin text-primary" />}
                {it.status === "failed" && <span className="absolute -bottom-1 left-0 right-0 text-center text-[9px] font-bold text-destructive">failed</span>}
                {it.status === "done" && <span className="absolute -bottom-1 left-0 right-0 text-center text-[9px] font-bold text-primary">✓</span>}
              </div>
            ))}
            {items.length < MAX_STORY_ITEMS && <button onClick={() => gallery.current?.click()} aria-label="Add more" className="h-14 w-10 flex-shrink-0 rounded-md border border-dashed border-border text-lg">+</button>}
          </div>
          <div className="mb-2 flex gap-2">
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={80} placeholder="Add text on this part" className="min-w-0 flex-1 rounded-lg bg-input px-3 py-2 text-sm outline-none" />
            <button disabled={!text.trim()} onClick={() => setTool({ kind: "text", value: text.trim() })} className="flex items-center gap-1 rounded-lg bg-muted px-3 text-xs font-bold disabled:opacity-40"><Type className="h-3.5 w-3.5" />Place</button>
          </div>
          <div className="mb-2 flex flex-wrap gap-1">
            {STORY_STICKERS.map((st) => <button key={st} aria-label={`Sticker ${st}`} onClick={() => setTool({ kind: "sticker", value: st })} className={`h-8 w-8 rounded-md text-lg ${tool?.value === st ? "bg-primary/25" : "bg-muted"}`}>{st}</button>)}
          </div>
          <div className="mb-3 flex gap-2 text-xs">
            <button onClick={() => setItems((c) => c.map((x, i) => (i === sel ? { ...x, overlays: x.overlays.slice(0, -1) } : x)))} disabled={!cur.overlays.length} className="rounded-lg bg-muted px-3 py-1.5 disabled:opacity-40">Undo text/sticker</button>
            <button onClick={() => removeItem(sel)} disabled={busy} className="flex items-center gap-1 rounded-lg bg-muted px-3 py-1.5 text-destructive"><Trash2 className="h-3 w-3" />Remove part</button>
          </div>
          <input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={300} placeholder="Caption (optional)" className="mb-3 w-full rounded-lg bg-input px-3 py-2 text-sm outline-none" />
          <p className="mb-1 text-xs font-bold">Who can see this</p>
          <div className="mb-3 flex gap-2">
            {VIS.map(({ v, icon: Icon, label }) => <button key={v} aria-pressed={visibility === v} onClick={() => setVisibility(v)} className={`flex flex-1 flex-col items-center gap-1 rounded-lg p-2 text-[11px] ${visibility === v ? "bg-primary text-primary-foreground" : "bg-muted"}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}
          </div>
          <button onClick={post} disabled={busy} className="w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">{busy ? "Posting…" : `Post story${items.length > 1 ? ` (${items.length} parts)` : ""}`}</button>
          <p className="mt-2 text-center text-[10px] text-muted-foreground">Disappears after 24 hours unless saved to a highlight</p>
        </>)}
      </div>
    </div>,
    document.body,
  );
}
