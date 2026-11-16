import { useState } from "react";
import { toast } from "sonner";
import { Camera, X, Sparkles } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { identifyVaultItem, VAULT_ITEM_CATEGORIES, type VaultItemGuess } from "@/lib/vaultItemIdentify.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const CATEGORIES = [...VAULT_ITEM_CATEGORIES] as string[];
const INTENTS = [
  { key: "keep", label: "Just keep it", desc: "Show it in my Vault" },
  { key: "sell", label: "Sell it", desc: "Create a listing next" },
  { key: "offers", label: "Accept offers", desc: "Let people make offers" },
  { key: "trade", label: "Open to trade", desc: "Show it in PB Trade" },
] as const;
type Intent = (typeof INTENTS)[number]["key"];

async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, 900 / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.82);
  } finally { URL.revokeObjectURL(url); }
}

export function VaultAddItemDialog({ userId, onClose, onSaved }: { userId: string; onClose: () => void; onSaved: (item: any, sell: boolean) => void }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [condition, setCondition] = useState("Used - Good");
  const [value, setValue] = useState("");
  const [paid, setPaid] = useState("");
  const [desc, setDesc] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [intents, setIntents] = useState<Intent[]>(["keep"]);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [guess, setGuess] = useState<VaultItemGuess | null>(null);
  const identify = useServerFn(identifyVaultItem);
  async function scanItem(img: string) {
    setScanning(true); setGuess(null);
    try {
      const g = await identify({ data: { image: img } });
      if (g.error || !g.name) { toast.error(g.error || "Couldn't recognize this item — add details yourself."); return; }
      setGuess(g); setName(g.name); setCategory(g.category);
      if (g.value_low && g.value_high) setValue(String(Math.round((g.value_low + g.value_high) / 2)));
    } catch { toast.error("Item scan failed — add details yourself."); } finally { setScanning(false); }
  }

  function toggle(k: Intent) {
    if (k === "keep") return setIntents(["keep"]);
    setIntents((cur) => { const n = cur.filter((x) => x !== "keep"); const next = n.includes(k) ? n.filter((x) => x !== k) : [...n, k]; return next.length ? next : ["keep"]; });
  }

  async function save() {
    if (!name.trim()) return toast.error("Give your item a name");
    const v = Number(value);
    if (!(v > 0)) return toast.error("Enter what the item is worth today");
    setBusy(true);
    const { data, error } = await supabase.from("vault_cards").insert({
      user_id: userId, name: name.trim(), category, condition,
      description: desc.trim() || null, image_url: photo, original_image_url: photo,
      image_source: photo ? "user_upload" : null,
      image_gallery: photo ? [{ url: photo, type: "user_upload", primary: true }] : [],
      estimated_value: v, custom_price: v, custom_price_source: "owner",
      purchase_price: Number(paid) > 0 ? Number(paid) : null,
      accept_trades: intents.includes("trade"), accept_offers: intents.includes("offers"),
      collection_only: intents.includes("keep"), last_valued_at: new Date().toISOString(),
    } as never).select().single();
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Added to your Vault");
    onSaved(data, intents.includes("sell"));
  }

  const input = "w-full rounded-lg bg-input px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-primary";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-3 backdrop-blur sm:items-center" onClick={onClose}>
      <div role="dialog" aria-label="Add an item" className="max-h-[92dvh] w-full max-w-lg space-y-3 overflow-y-auto rounded-2xl bg-card p-5 ring-1 ring-border" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div><p className="text-lg font-black">Add any item</p><p className="text-xs text-muted-foreground">Electronics, cars, tools, fashion — anything you own.</p></div>
          <button onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <label className="flex aspect-video cursor-pointer items-center justify-center overflow-hidden rounded-xl bg-muted ring-1 ring-border">
          {photo ? <img src={photo} alt="" className="h-full w-full object-contain" /> : <span className="flex flex-col items-center gap-1 text-xs text-muted-foreground"><Camera className="h-6 w-6" />Snap a photo — we recognize it and estimate its value</span>}
          <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const img = await shrink(f); setPhoto(img); void scanItem(img); } }} />
        </label>
        {scanning && <p className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-xs font-semibold text-primary"><Sparkles className="h-3.5 w-3.5 animate-pulse" />Recognizing your item and checking resale prices…</p>}
        {guess && !scanning && <div className="rounded-lg bg-primary/10 px-3 py-2 text-xs"><p className="font-bold">Looks like: {guess.name}</p>{guess.value_low && guess.value_high && <p className="text-muted-foreground">Typical used resale: ${guess.value_low.toFixed(0)} – ${guess.value_high.toFixed(0)} · AI estimate ({Math.round(guess.confidence * 100)}% sure). Adjust if needed.</p>}</div>}
        <input className={input} placeholder="Item name (e.g. Dyson V15 vacuum)" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <select className={input} value={category} onChange={(e) => setCategory(e.target.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          <select className={input} value={condition} onChange={(e) => setCondition(e.target.value)}>{["New", "Like new", "Used - Good", "Used - Fair", "For parts"].map((c) => <option key={c}>{c}</option>)}</select>
          <input className={input} inputMode="decimal" placeholder="Worth today ($)" value={value} onChange={(e) => setValue(e.target.value)} />
          <input className={input} inputMode="decimal" placeholder="Paid (optional)" value={paid} onChange={(e) => setPaid(e.target.value)} />
        </div>
        <textarea className={input} rows={2} placeholder="Details (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} />
        <div>
          <p className="mb-1.5 text-xs font-bold">What do you want to do with it?</p>
          <div className="grid grid-cols-2 gap-2">
            {INTENTS.map((i) => (
              <button key={i.key} type="button" onClick={() => toggle(i.key)} className={`rounded-xl p-2.5 text-left ring-1 transition ${intents.includes(i.key) ? "bg-primary/15 ring-primary" : "bg-muted/40 ring-border"}`}>
                <span className="block text-xs font-bold">{i.label}</span><span className="text-[10px] text-muted-foreground">{i.desc}</span>
              </button>
            ))}
          </div>
        </div>
        <Button className="w-full" disabled={busy} onClick={save}>{busy ? "Saving…" : "Add to Vault"}</Button>
      </div>
    </div>
  );
}
