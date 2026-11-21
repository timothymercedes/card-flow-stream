import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, ArrowRight, ImagePlus, Loader2, RotateCcw, Star, X, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { ListingPhotoCapture } from "@/components/ListingPhotoCapture";
import { MAX_LISTING_PHOTOS, MIN_LISTING_PHOTOS, makeCover, movePhoto } from "@/lib/listingPhotos";

type Pending = { id: string; file: File; name: string; status: "uploading" | "failed" };

type Props = { value: string[]; onChange: (photos: string[]) => void; label?: string; required?: boolean };

/**
 * Real-photo manager for sale/trade listings: camera, gallery or desktop
 * multi-select; 2–10 photos; reorder; choose cover; remove; per-file retry.
 * AI-generated images are never offered here.
 */
export function ListingPhotoManager({ value, onChange, label = "Photos", required = true }: Props) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const latest = useRef(value);
  latest.current = value;

  async function uploadOne(p: Pending) {
    if (!user) return;
    setPending((all) => all.map((x) => (x.id === p.id ? { ...x, status: "uploading" } : x)));
    try {
      const ext = (p.file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("listing-images").upload(path, p.file, {
        cacheControl: "3600", contentType: p.file.type || "image/jpeg", upsert: false,
      });
      if (error) throw error;
      const url = supabase.storage.from("listing-images").getPublicUrl(path).data.publicUrl;
      if (latest.current.length >= MAX_LISTING_PHOTOS) throw new Error("Photo limit reached");
      latest.current = [...latest.current, url];
      onChange(latest.current);
      setPending((all) => all.filter((x) => x.id !== p.id));
    } catch {
      setPending((all) => all.map((x) => (x.id === p.id ? { ...x, status: "failed" } : x)));
    }
  }

  function addFiles(list: FileList | null) {
    if (!list || !user) { if (!user) toast.error("Sign in first"); return; }
    const room = MAX_LISTING_PHOTOS - value.length - pending.length;
    const files = Array.from(list).filter((f) => f.type.startsWith("image/"));
    if (files.length > room) toast.message(`Only ${Math.max(room, 0)} more photo(s) fit — max ${MAX_LISTING_PHOTOS}.`);
    const items = files.slice(0, Math.max(room, 0)).map((file) => ({ id: crypto.randomUUID(), file, name: file.name, status: "uploading" as const }));
    setPending((all) => [...all, ...items]);
    items.forEach((it) => void uploadOne(it));
    if (inputRef.current) inputRef.current.value = "";
  }

  const uploading = pending.filter((p) => p.status === "uploading").length;
  const full = value.length + pending.length >= MAX_LISTING_PHOTOS;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[11px] font-semibold text-muted-foreground">{label}{required ? ` * (${value.length}/${MAX_LISTING_PHOTOS}, min ${MIN_LISTING_PHOTOS})` : ` (${value.length}/${MAX_LISTING_PHOTOS})`}</p>
        {uploading > 0 && <p className="flex items-center gap-1 text-[11px] text-muted-foreground" aria-live="polite"><Loader2 className="h-3 w-3 animate-spin" /> Uploading {uploading}…</p>}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {value.map((url, i) => (
          <div key={url} className="relative overflow-hidden rounded-lg ring-1 ring-border">
            <img src={url} alt={`Photo ${i + 1}${i === 0 ? " (cover)" : ""}`} className="aspect-square w-full object-cover" />
            {i === 0 && <span className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">Cover</span>}
            <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => onChange(value.filter((_, j) => j !== i))} className="absolute right-1 top-1 rounded-full bg-background/90 p-1"><X className="h-3 w-3" /></button>
            <div className="flex justify-between bg-background/90 p-1">
              <button type="button" aria-label={`Move photo ${i + 1} left`} disabled={i === 0} onClick={() => onChange(movePhoto(value, i, i - 1))} className="p-1 disabled:opacity-30"><ArrowLeft className="h-3 w-3" /></button>
              <button type="button" aria-label={`Make photo ${i + 1} the cover`} disabled={i === 0} onClick={() => onChange(makeCover(value, i))} className="p-1 disabled:opacity-30"><Star className="h-3 w-3" /></button>
              <button type="button" aria-label={`Move photo ${i + 1} right`} disabled={i === value.length - 1} onClick={() => onChange(movePhoto(value, i, i + 1))} className="p-1 disabled:opacity-30"><ArrowRight className="h-3 w-3" /></button>
            </div>
          </div>
        ))}
        {pending.map((p) => (
          <div key={p.id} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg bg-muted p-1 text-center text-[10px]">
            {p.status === "uploading" ? <><Loader2 className="h-5 w-5 animate-spin" /><span className="line-clamp-1">{p.name}</span></> : <>
              <AlertCircle className="h-5 w-5 text-destructive" /><span>Upload failed</span>
              <div className="flex gap-1">
                <button type="button" onClick={() => void uploadOne(p)} className="flex items-center gap-0.5 rounded bg-background px-1.5 py-0.5 font-bold"><RotateCcw className="h-3 w-3" />Retry</button>
                <button type="button" aria-label="Discard failed photo" onClick={() => setPending((all) => all.filter((x) => x.id !== p.id))} className="rounded bg-background px-1"><X className="h-3 w-3" /></button>
              </div></>}
          </div>
        ))}
      </div>
      {!full && <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => inputRef.current?.click()} className="flex items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border bg-muted/30 py-3 text-xs font-bold text-muted-foreground hover:border-primary hover:text-primary">
          <ImagePlus className="h-4 w-4" /> Add photos
        </button>
        <ListingPhotoCapture value="" label="Take photo" onChange={(url) => { if (url && latest.current.length < MAX_LISTING_PHOTOS) { latest.current = [...latest.current, url]; onChange(latest.current); } }} />
      </div>}
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" aria-label={`${label} file picker`} onChange={(e) => addFiles(e.target.files)} />
      <p className="mt-1 text-[10px] text-muted-foreground">Real photos of the actual item only — AI images aren't allowed for sale or trade. Tap ★ to choose the cover.</p>
    </div>
  );
}
