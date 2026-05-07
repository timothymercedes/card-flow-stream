import { useEffect, useState } from "react";
import { Trash2, Upload, Plus, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Audience = "buyer" | "seller" | "host" | "flex" | "auction" | "general";

type Row = {
  id: string;
  title: string;
  description: string | null;
  audience: Audience;
  category: string;
  video_url: string;
  captions_url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  order_index: number;
  is_published: boolean;
};

const AUDIENCES: Audience[] = ["buyer", "seller", "host", "flex", "auction", "general"];

export function TutorialsAdmin() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", audience: "buyer" as Audience, category: "getting-started",
    order_index: 0,
  });
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [vttFile, setVttFile] = useState<File | null>(null);

  async function load() {
    const { data } = await supabase.from("tutorials").select("*").order("audience").order("order_index");
    setRows((data as any[]) || []);
  }
  useEffect(() => { load(); }, []);

  async function uploadFile(file: File, prefix: string) {
    const ext = file.name.split(".").pop() || "bin";
    const path = `${prefix}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("tutorials").upload(path, file, {
      contentType: file.type, upsert: false,
    });
    if (error) throw error;
    return supabase.storage.from("tutorials").getPublicUrl(path).data.publicUrl;
  }

  async function submit() {
    if (!form.title.trim()) return toast.error("Add a title");
    if (!videoFile) return toast.error("Pick a video file");
    setBusy(true);
    try {
      const video_url = await uploadFile(videoFile, "videos");
      const thumbnail_url = thumbFile ? await uploadFile(thumbFile, "thumbs") : null;
      const captions_url = vttFile ? await uploadFile(vttFile, "captions") : null;
      // grab duration from video
      const duration = await new Promise<number | null>((resolve) => {
        const v = document.createElement("video");
        v.preload = "metadata";
        v.onloadedmetadata = () => resolve(Math.floor(v.duration) || null);
        v.onerror = () => resolve(null);
        v.src = URL.createObjectURL(videoFile);
      });
      const { error } = await supabase.from("tutorials").insert({
        title: form.title.trim(),
        description: form.description.trim() || null,
        audience: form.audience,
        category: form.category.trim() || "getting-started",
        video_url, thumbnail_url, captions_url,
        duration_seconds: duration,
        order_index: Number(form.order_index) || 0,
        is_published: true,
      });
      if (error) throw error;
      toast.success("Tutorial uploaded");
      setForm({ title: "", description: "", audience: "buyer", category: "getting-started", order_index: 0 });
      setVideoFile(null); setThumbFile(null); setVttFile(null);
      load();
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function togglePublish(r: Row) {
    const { error } = await supabase.from("tutorials").update({ is_published: !r.is_published }).eq("id", r.id);
    if (error) return toast.error(error.message);
    load();
  }

  async function remove(r: Row) {
    if (!confirm(`Delete "${r.title}"?`)) return;
    const { error } = await supabase.from("tutorials").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-card p-3 space-y-2">
        <p className="flex items-center gap-1.5 text-xs font-bold"><Plus className="h-3.5 w-3.5" /> Add tutorial</p>
        <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          placeholder="Title" className="w-full rounded-lg bg-input px-3 py-2 text-xs" />
        <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="Short description" rows={2} className="w-full rounded-lg bg-input px-3 py-2 text-xs" />
        <div className="grid grid-cols-3 gap-2">
          <select value={form.audience} onChange={e => setForm(f => ({ ...f, audience: e.target.value as Audience }))}
            className="rounded-lg bg-input px-2 py-2 text-xs">
            {AUDIENCES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
            placeholder="category" className="rounded-lg bg-input px-2 py-2 text-xs" />
          <input type="number" value={form.order_index}
            onChange={e => setForm(f => ({ ...f, order_index: Number(e.target.value) }))}
            placeholder="Order" className="rounded-lg bg-input px-2 py-2 text-xs" />
        </div>
        <div className="grid grid-cols-1 gap-2">
          <label className="flex items-center gap-2 text-[11px]">
            <span className="w-20 text-muted-foreground">Video *</span>
            <input type="file" accept="video/*" onChange={e => setVideoFile(e.target.files?.[0] || null)} className="text-[11px]" />
          </label>
          <label className="flex items-center gap-2 text-[11px]">
            <span className="w-20 text-muted-foreground">Thumbnail</span>
            <input type="file" accept="image/*" onChange={e => setThumbFile(e.target.files?.[0] || null)} className="text-[11px]" />
          </label>
          <label className="flex items-center gap-2 text-[11px]">
            <span className="w-20 text-muted-foreground">Captions</span>
            <input type="file" accept=".vtt,text/vtt" onChange={e => setVttFile(e.target.files?.[0] || null)} className="text-[11px]" />
          </label>
        </div>
        <button onClick={submit} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50">
          <Upload className="h-3.5 w-3.5" /> {busy ? "Uploading…" : "Upload"}
        </button>
      </div>

      <div className="space-y-2">
        {rows.map(r => (
          <div key={r.id} className="flex items-center gap-3 rounded-xl bg-card p-3">
            <div className="h-12 w-9 flex-shrink-0 overflow-hidden rounded bg-black">
              {r.thumbnail_url && <img src={r.thumbnail_url} alt="" className="h-full w-full object-cover" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold">{r.title}</p>
              <p className="text-[10px] text-muted-foreground">{r.audience} · {r.category} · #{r.order_index}{r.duration_seconds ? ` · ${r.duration_seconds}s` : ""}</p>
            </div>
            <button onClick={() => togglePublish(r)} title={r.is_published ? "Unpublish" : "Publish"}
              className={`rounded-lg p-2 ${r.is_published ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground"}`}>
              {r.is_published ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
            <button onClick={() => remove(r)} className="rounded-lg bg-destructive/15 p-2 text-destructive">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {rows.length === 0 && <p className="text-center text-xs text-muted-foreground py-4">No tutorials yet.</p>}
      </div>
    </div>
  );
}
