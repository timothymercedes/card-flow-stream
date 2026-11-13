import { useEffect, useState } from "react";
import { BazaarImage } from "@/components/bazaar/BazaarImage";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BAZAAR_DEPARTMENTS, parseVariantOptions, dollarsToCents } from "@/lib/bazaar";
import { ArrowLeft, ArrowRight, Loader2, Plus, Star, Trash2, Upload } from "lucide-react";

type VariantDraft = { id?: string; label: string; sku: string; price: string; compare: string; quantity: string; is_active: boolean };
const blankVariant = (): VariantDraft => ({ label: "", sku: "", price: "", compare: "", quantity: "0", is_active: true });

export function ProductEditor({ storeId, productId, open, onClose, onSaved }: { storeId: string; productId: string | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [f, setF] = useState({ title: "", description: "", department: "", subcategory: "", brand: "", model: "", condition: "new", status: "draft", video_url: "" });
  const [images, setImages] = useState<string[]>([]);
  const [variants, setVariants] = useState<VariantDraft[]>([blankVariant()]);
  const [removed, setRemoved] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setRemoved([]);
    if (!productId) { setF({ title: "", description: "", department: "", subcategory: "", brand: "", model: "", condition: "new", status: "draft", video_url: "" }); setImages([]); setVariants([blankVariant()]); return; }
    setLoading(true);
    supabase.from("bazaar_products").select("*, bazaar_product_variants(*)").eq("id", productId).maybeSingle().then(({ data, error }) => {
      setLoading(false);
      if (error || !data) { toast.error("Couldn't load product"); return; }
      setF({ title: data.title, description: data.description ?? "", department: data.department ?? "", subcategory: data.subcategory ?? "", brand: data.brand ?? "", model: data.model ?? "", condition: data.condition, status: data.status, video_url: data.video_url ?? "" });
      setImages(data.images ?? []);
      const vs = (data.bazaar_product_variants ?? []).map((v) => ({ id: v.id, label: Object.entries((v.options ?? {}) as Record<string, string>).map(([k, val]) => `${k}: ${val}`).join(", "), sku: v.sku ?? "", price: (v.price_cents / 100).toFixed(2), compare: v.compare_at_cents ? (v.compare_at_cents / 100).toFixed(2) : "", quantity: String(v.quantity), is_active: v.is_active }));
      setVariants(vs.length ? vs : [blankVariant()]);
    });
  }, [open, productId]);

  async function upload(files: FileList | null) {
    if (!files?.length || !user) return;
    setUploading(true);
    const urls: string[] = [];
    for (const file of Array.from(files).slice(0, 10 - images.length)) {
      if (!file.type.startsWith("image/") || file.size > 8_000_000) { toast.error(`${file.name}: images up to 8MB only`); continue; }
      const path = `${storeId}/${user.id}/${crypto.randomUUID()}.${file.name.split(".").pop() || "jpg"}`;
      const { error } = await supabase.storage.from("bazaar-media").upload(path, file, { contentType: file.type });
      if (error) { toast.error(error.message); continue; }
      urls.push(path);
    }
    setImages((i) => [...i, ...urls]); setUploading(false);
  }
  const move = (i: number, d: number) => setImages((arr) => { const a = [...arr]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; });
  const setV = (i: number, k: keyof VariantDraft, v: string | boolean) => setVariants((vs) => vs.map((x, idx) => (idx === i ? { ...x, [k]: v } : x)));

  async function save() {
    if (f.title.trim().length < 2) return toast.error("Add a title");
    const parsed = [];
    for (const v of variants) {
      const price = dollarsToCents(v.price);
      if (price === null) return toast.error("Each option needs a valid price");
      const compare = v.compare ? dollarsToCents(v.compare) : null;
      if (compare !== null && compare <= price) return toast.error("Compare-at price must be higher than the price");
      const qty = Math.max(0, Math.floor(Number(v.quantity) || 0));
      parsed.push({ id: v.id, sku: v.sku.trim() || null, options: parseVariantOptions(v.label), price_cents: price, compare_at_cents: compare, quantity: qty, is_active: v.is_active });
    }
    if (f.status === "published" && !images.length) return toast.error("Add at least one photo before publishing");
    setSaving(true);
    const row = { store_id: storeId, title: f.title.trim(), description: f.description || null, department: f.department || null, subcategory: f.subcategory || null, brand: f.brand || null, model: f.model || null, condition: f.condition, status: f.status, video_url: f.video_url || null, images };
    const res = productId ? await supabase.from("bazaar_products").update(row).eq("id", productId).select("id").single() : await supabase.from("bazaar_products").insert(row).select("id").single();
    if (res.error) { setSaving(false); return toast.error(res.error.message); }
    const pid = res.data.id;
    if (removed.length) await supabase.from("bazaar_product_variants").delete().in("id", removed);
    for (const v of parsed) {
      const { id, ...rest } = v;
      const r = id ? await supabase.from("bazaar_product_variants").update(rest).eq("id", id) : await supabase.from("bazaar_product_variants").insert({ ...rest, product_id: pid });
      if (r.error) { setSaving(false); return toast.error(r.error.code === "23505" ? "Each SKU must be unique" : r.error.message); }
    }
    setSaving(false); toast.success("Product saved"); onSaved(); onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{productId ? "Edit product" : "New product"}</DialogTitle></DialogHeader>
        {loading ? <Loader2 className="mx-auto h-6 w-6 animate-spin" /> : (
          <div className="space-y-4">
            <Input placeholder="Product title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            <Textarea placeholder="Description and specifications" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
            <div className="grid gap-2 sm:grid-cols-2">
              <select value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} className="rounded-md border border-input bg-background px-3 py-2 text-sm" aria-label="Department">
                <option value="">Department…</option>{BAZAAR_DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
              </select>
              <Input placeholder="Subcategory" value={f.subcategory} onChange={(e) => setF({ ...f, subcategory: e.target.value })} />
              <Input placeholder="Brand" value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })} />
              <Input placeholder="Model" value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} />
              <select value={f.condition} onChange={(e) => setF({ ...f, condition: e.target.value })} className="rounded-md border border-input bg-background px-3 py-2 text-sm" aria-label="Condition">
                <option value="new">New</option><option value="refurbished">Refurbished</option><option value="used">Used</option>
              </select>
              <Input placeholder="Video link (optional)" value={f.video_url} onChange={(e) => setF({ ...f, video_url: e.target.value })} />
            </div>

            <div>
              <p className="mb-2 text-sm font-bold">Photos <span className="font-normal text-muted-foreground">(first photo is the main one)</span></p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {images.map((src, i) => (
                  <div key={src} className="relative overflow-hidden rounded-lg ring-1 ring-border">
                    <BazaarImage src={src} alt="" className="aspect-square w-full object-cover" />
                    {i === 0 && <Star className="absolute left-1 top-1 h-4 w-4 fill-primary text-primary" aria-label="Main photo" />}
                    <div className="absolute inset-x-0 bottom-0 flex justify-between bg-background/80 p-0.5">
                      <button type="button" onClick={() => move(i, -1)} aria-label="Move left"><ArrowLeft className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => setImages((a) => a.filter((_, j) => j !== i))} aria-label="Remove photo"><Trash2 className="h-3.5 w-3.5 text-destructive" /></button>
                      <button type="button" onClick={() => move(i, 1)} aria-label="Move right"><ArrowRight className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                ))}
                {images.length < 10 && (
                  <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border text-xs text-muted-foreground">
                    {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}Add
                    <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
                  </label>
                )}
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-bold">Options, price & stock</p>
              <div className="space-y-2">
                {variants.map((v, i) => (
                  <div key={v.id ?? i} className="grid grid-cols-2 gap-2 rounded-lg bg-muted/50 p-2 sm:grid-cols-6">
                    <Input className="col-span-2" placeholder="e.g. Size: M, Color: Black" value={v.label} onChange={(e) => setV(i, "label", e.target.value)} />
                    <Input placeholder="SKU" value={v.sku} onChange={(e) => setV(i, "sku", e.target.value)} />
                    <Input inputMode="decimal" placeholder="Price $" value={v.price} onChange={(e) => setV(i, "price", e.target.value)} />
                    <Input inputMode="decimal" placeholder="Compare $" value={v.compare} onChange={(e) => setV(i, "compare", e.target.value)} />
                    <div className="flex items-center gap-1">
                      <Input type="number" min={0} placeholder="Qty" value={v.quantity} onChange={(e) => setV(i, "quantity", e.target.value)} />
                      {variants.length > 1 && <button type="button" aria-label="Remove option" onClick={() => { if (v.id) setRemoved((r) => [...r, v.id!]); setVariants((vs) => vs.filter((_, j) => j !== i)); }}><Trash2 className="h-4 w-4 text-destructive" /></button>}
                    </div>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setVariants((vs) => [...vs, blankVariant()])}><Plus className="mr-1 h-4 w-4" /> Add option</Button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className="rounded-md border border-input bg-background px-3 py-2 text-sm" aria-label="Status">
                <option value="draft">Draft</option><option value="published">Published</option><option value="paused">Paused</option><option value="archived">Archived</option>
              </select>
              <Button onClick={save} disabled={saving || uploading}>{saving ? "Saving…" : "Save product"}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
