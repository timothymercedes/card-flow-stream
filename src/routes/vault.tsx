import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { Trash2, Plus, Camera, Tag, Pencil, X, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { CardScanner } from "@/components/CardScanner";

export const Route = createFileRoute("/vault")({ component: Vault });

type Condition = "NM" | "LP" | "MP" | "Damaged";
type ConditionPrices = { NM?: number; LP?: number; MP?: number; Damaged?: number };
type Card = {
  id: string; user_id: string; name: string; category: string | null;
  image_url: string | null; back_image_url?: string | null; description: string | null;
  estimated_value: number | null; price: number | null;
  tcg_number?: string | null; tcg_set?: string | null; tcg_year?: string | null;
  condition?: Condition | null;
  condition_prices?: ConditionPrices | null;
};

function Vault() {
  const { user, profile } = useAuth();
  const nav = useNavigate();
  const [cards, setCards] = useState<Card[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [editing, setEditing] = useState<Card | null>(null);
  const [selling, setSelling] = useState<Card | null>(null);
  const [actionFor, setActionFor] = useState<Card | null>(null);

  // add form
  const [name, setName] = useState("");
  const [tcgNumber, setTcgNumber] = useState("");
  const [tcgSet, setTcgSet] = useState("");
  const [tcgYear, setTcgYear] = useState("");
  const [category, setCategory] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [backImageUrl, setBackImageUrl] = useState("");
  const [description, setDescription] = useState("");
  const [estValue, setEstValue] = useState(""); // auto-filled, read-only
  const [condPrices, setCondPrices] = useState<ConditionPrices | null>(null);
  const [price, setPrice] = useState("");
  const [condition, setCondition] = useState<Condition>("NM");
  const [identifying, setIdentifying] = useState(false);

  async function load() {
    if (!user) return;
    const { data } = await supabase.from("vault_cards").select("*").order("created_at", { ascending: false });
    setCards((data || []) as Card[]);
    // Fire-and-forget on-open refresh of stale values (>20h old)
    const stale = (data || []).some((c: any) => !c.last_valued_at || (Date.now() - new Date(c.last_valued_at).getTime()) > 20 * 60 * 60 * 1000);
    if (stale) {
      fetch("/api/public/hooks/refresh-vault-values", { method: "POST" })
        .then((r) => r.ok && setTimeout(async () => {
          const { data: fresh } = await supabase.from("vault_cards").select("*").order("created_at", { ascending: false });
          if (fresh) setCards(fresh as Card[]);
        }, 1500))
        .catch(() => {});
    }
  }
  useEffect(() => { load(); }, [user]);

  const totalValue = useMemo(
    () => cards.reduce((s, c) => s + Number(c.estimated_value || 0), 0),
    [cards]
  );

  function resetForm() {
    setName(""); setTcgNumber(""); setTcgSet(""); setTcgYear(""); setCategory("");
    setImageUrl(""); setBackImageUrl("");
    setDescription(""); setEstValue(""); setCondPrices(null); setPrice(""); setCondition("NM");
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>, setter: (v: string) => void) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setter(String(reader.result));
    reader.readAsDataURL(f);
  }

  function priceFor(cond: Condition, base: number, cp: ConditionPrices | null | undefined): number {
    if (cp && cp[cond] && Number(cp[cond])) return Number(cp[cond]);
    const mult = cond === "NM" ? 1 : cond === "LP" ? 0.85 : cond === "MP" ? 0.6 : 0.25;
    return Math.max(0.5, Math.round(base * mult * 100) / 100);
  }

  // Auto-update displayed value when condition changes (uses condition_prices map)
  useEffect(() => {
    if (!condPrices) return;
    const base = Number(condPrices.NM) || 0;
    if (!base) return;
    setEstValue(String(priceFor(condition, base, condPrices)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [condition, condPrices]);

  async function identifyNow() {
    if (!name.trim()) return toast.error("Enter a card name first");
    setIdentifying(true);
    try {
      const q = [name, tcgNumber && `#${tcgNumber}`, tcgSet && `set: ${tcgSet}`, tcgYear && `year: ${tcgYear}`].filter(Boolean).join(" ");
      const { data, error } = await supabase.functions.invoke("identify-card", { body: { query: q } });
      if (error) throw error;
      if (data?.name) setName(data.name);
      if (data?.category && !category) setCategory(data.category);
      if (data?.set && !tcgSet) setTcgSet(data.set);
      if (data?.year && !tcgYear) setTcgYear(String(data.year));
      if (data?.tcg_number && !tcgNumber) setTcgNumber(data.tcg_number);
      const cp: ConditionPrices | null = data?.condition_prices || null;
      setCondPrices(cp);
      const base = Number(data?.estimated_value) || 0;
      if (base) setEstValue(String(priceFor(condition, base, cp)));
      toast.success(`Identified: ${data?.name || name} • ${data?.set || ""} ${data?.year || ""}`);
    } catch (e: any) { toast.error(e?.message || "Identification failed"); }
    finally { setIdentifying(false); }
  }

  async function add() {
    if (!name.trim()) return toast.error("Card name required");
    let value = Number(estValue) || 0;
    let cat = category;
    let cp: ConditionPrices | null = condPrices;
    let setName2 = tcgSet, year2 = tcgYear, num2 = tcgNumber;
    // If value is missing, auto-identify (value cannot be edited manually)
    if (!value) {
      try {
        const q = [name, tcgNumber && `#${tcgNumber}`, tcgSet && `set: ${tcgSet}`, tcgYear && `year: ${tcgYear}`].filter(Boolean).join(" ");
        const { data } = await supabase.functions.invoke("identify-card", { body: { query: q } });
        if (data) {
          cp = data.condition_prices || null;
          const base = Number(data.estimated_value) || 0;
          value = priceFor(condition, base, cp);
          cat = cat || data.category || "Trading Card";
          setName2 = setName2 || data.set || "";
          year2 = year2 || (data.year ? String(data.year) : "");
          num2 = num2 || data.tcg_number || "";
        }
      } catch {/* ignore */}
    }
    const { error } = await supabase.from("vault_cards").insert({
      user_id: user!.id, name, category: cat || "Trading Card",
      image_url: imageUrl || null, back_image_url: backImageUrl || null,
      description: description || null,
      estimated_value: value,
      condition_prices: cp as any,
      price: price ? Number(price) : null,
      tcg_number: num2 || null, tcg_set: setName2 || null, tcg_year: year2 || null,
      condition,
      last_valued_at: new Date().toISOString(),
    });
    if (error) return toast.error(error.message);
    resetForm(); setShowAdd(false);
    load();
  }
  async function remove(id: string) {
    await supabase.from("vault_cards").delete().eq("id", id);
    load();
  }
  async function saveEdit() {
    if (!editing) return;
    // estimated_value is auto-managed by TCG; recompute from condition_prices if condition changed
    let newValue = editing.estimated_value;
    if (editing.condition_prices) {
      newValue = priceFor((editing.condition || "NM") as Condition, Number(editing.condition_prices.NM || editing.estimated_value || 0), editing.condition_prices);
    }
    const { error } = await supabase.from("vault_cards").update({
      name: editing.name, category: editing.category, image_url: editing.image_url,
      back_image_url: editing.back_image_url || null,
      description: editing.description,
      price: editing.price != null ? Number(editing.price) : null,
      tcg_number: editing.tcg_number || null, tcg_set: editing.tcg_set || null, tcg_year: editing.tcg_year || null,
      condition: editing.condition || null,
      estimated_value: newValue,
    }).eq("id", editing.id);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    setEditing(null);
    load();
  }

  async function refreshValue(card: Card) {
    try {
      const q = [card.name, card.tcg_number && `#${card.tcg_number}`, card.tcg_set && `set: ${card.tcg_set}`, card.tcg_year && `year: ${card.tcg_year}`].filter(Boolean).join(" ");
      const { data } = await supabase.functions.invoke("identify-card", { body: { query: q } });
      const base = Number(data?.estimated_value);
      if (!isFinite(base) || base <= 0) return toast.error("Couldn't get a price");
      const cp: ConditionPrices | null = data?.condition_prices || null;
      const v = priceFor((card.condition || "NM") as Condition, base, cp);
      await supabase.from("vault_cards").update({
        estimated_value: v, condition_prices: cp as any,
        tcg_set: card.tcg_set || data?.set || null,
        tcg_year: card.tcg_year || (data?.year ? String(data.year) : null),
        tcg_number: card.tcg_number || data?.tcg_number || null,
        last_valued_at: new Date().toISOString(),
      }).eq("id", card.id);
      toast.success(`Updated to $${v}`);
      load();
    } catch (e: any) { toast.error(e?.message || "Refresh failed"); }
  }

  function onScanResult(r: { name: string; category: string; trend: string; image: string }) {
    setName(r.name); setCategory(r.category); setImageUrl(r.image);
    setScanning(false); setShowAdd(true);
    toast.success(`Identified: ${r.name}`);
  }

  async function listForSale(card: Card, opts: { buy_now: boolean; auction: boolean; offer: boolean; days: number; price: number; reserve?: number }) {
    if (!profile?.is_seller) await supabase.from("profiles").update({ is_seller: true }).eq("id", user!.id);
    const primary: "buy_now" | "auction" | "offer" = opts.auction ? "auction" : opts.buy_now ? "buy_now" : "offer";
    const condDesc = card.condition ? ` — Condition: ${card.condition}` : "";
    const { data, error } = await supabase.from("listings").insert({
      seller_id: user!.id, title: card.name,
      description: (card.description || `From my vault — ${card.category || "Trading Card"}`) + condDesc,
      image_url: card.image_url,
      listing_type: primary,
      is_auction: opts.auction,
      accepts_offers: opts.offer,
      price: opts.buy_now ? opts.price : null,
      starting_bid: opts.auction ? Math.max(1, opts.price || 1) : null,
      current_bid: opts.auction ? Math.max(1, opts.price || 1) : null,
      reserve_price: opts.auction && opts.reserve ? opts.reserve : null,
      auction_ends_at: opts.auction ? new Date(Date.now() + opts.days * 24 * 60 * 60 * 1000).toISOString() : null,
      condition: card.condition || null,
      tcg_number: card.tcg_number || null,
      tcg_set: card.tcg_set || null,
    }).select().single();
    if (error) return toast.error(error.message);
    toast.success("Listed!");
    setSelling(null);
    nav({ to: "/market/$id", params: { id: data.id } });
  }

  if (!user) return (
    <AppShell>
      <div className="px-6 py-16 text-center">
        <h1 className="text-xl font-bold">Your Vault</h1>
        <p className="mt-2 text-sm text-muted-foreground">Sign in to save your cards.</p>
        <Link to="/auth" className="mt-6 inline-block rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">Sign In</Link>
      </div>
    </AppShell>
  );

  return (
    <AppShell>
      <div className="px-4 py-4">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-2xl font-bold">My Vault</h1>
          <div className="flex gap-2">
            <button onClick={() => setScanning(true)} className="flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground"><Camera className="h-3 w-3" /> Scan</button>
            <button onClick={() => { resetForm(); setShowAdd(true); }} className="flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"><Plus className="h-3 w-3" /> Add</button>
          </div>
        </div>

        {/* Total value (owner only) */}
        <div className="mb-4 rounded-xl bg-gradient-to-br from-primary/30 to-accent/20 p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total Vault Value</p>
          <p className="text-3xl font-bold">${totalValue.toFixed(2)}</p>
          <p className="text-[10px] text-muted-foreground">{cards.length} card{cards.length !== 1 ? "s" : ""} • visible only to you</p>
        </div>

        {showAdd && (
          <div className="mb-4 space-y-2 rounded-xl bg-card p-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] text-muted-foreground">Front photo</p>
                {imageUrl && <img src={imageUrl} className="mt-1 h-24 w-full rounded-lg object-cover" alt="" />}
                <input type="file" accept="image/*" onChange={(e) => handleFile(e, setImageUrl)} className="mt-1 block w-full text-[10px]" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Back photo</p>
                {backImageUrl && <img src={backImageUrl} className="mt-1 h-24 w-full rounded-lg object-cover" alt="" />}
                <input type="file" accept="image/*" onChange={(e) => handleFile(e, setBackImageUrl)} className="mt-1 block w-full text-[10px]" />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">Front photo required to add. Back photo required to sell.</p>
            <input className="w-full rounded-lg bg-input px-3 py-2 text-sm" placeholder="Card name (e.g., Charizard VMAX, LeBron Rookie)" value={name} onChange={(e) => setName(e.target.value)} />
            <div className="grid grid-cols-3 gap-2">
              <input className="rounded-lg bg-input px-3 py-2 text-sm" placeholder="Card #" value={tcgNumber} onChange={(e) => setTcgNumber(e.target.value)} />
              <input className="rounded-lg bg-input px-3 py-2 text-sm" placeholder="Set" value={tcgSet} onChange={(e) => setTcgSet(e.target.value)} />
              <input className="rounded-lg bg-input px-3 py-2 text-sm" placeholder="Year" value={tcgYear} onChange={(e) => setTcgYear(e.target.value)} />
            </div>
            <input className="w-full rounded-lg bg-input px-3 py-2 text-sm" placeholder="Category (Pokémon, MTG, ...)" value={category} onChange={(e) => setCategory(e.target.value)} />
            <div>
              <p className="text-[10px] text-muted-foreground">Condition</p>
              <div className="mt-1 grid grid-cols-4 gap-1">
                {(["NM", "LP", "MP", "Damaged"] as const).map((c) => (
                  <button key={c} type="button" onClick={() => setCondition(c)}
                    className={`rounded-lg px-2 py-1.5 text-xs font-bold ${condition === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{c}</button>
                ))}
              </div>
            </div>
            <textarea rows={2} className="w-full resize-none rounded-lg bg-input px-3 py-2 text-sm" placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs">
                <p className="text-[9px] uppercase text-muted-foreground">Value (auto)</p>
                <p className="font-bold">{estValue ? `$${Number(estValue).toFixed(2)}` : "—"}</p>
              </div>
              <input type="number" min="0" step="0.01" className="rounded-lg bg-input px-3 py-2 text-sm" placeholder="My ask price ($)" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <button type="button" onClick={identifyNow} disabled={identifying} className="w-full rounded-lg bg-accent py-2 text-xs font-semibold text-accent-foreground disabled:opacity-60">
              {identifying ? "Identifying..." : "🔍 Identify & price via TCG"}
            </button>
            <p className="text-[10px] text-muted-foreground">Value is set automatically from TCG market data — it can't be edited.</p>
            <div className="flex gap-2">
              <button onClick={add} className="flex-1 rounded-lg bg-primary py-2 text-sm font-bold text-primary-foreground">Save</button>
              <button onClick={() => { setShowAdd(false); resetForm(); }} className="rounded-lg bg-muted px-3 py-2 text-sm">Cancel</button>
            </div>
          </div>
        )}

        {cards.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">Your vault is empty</p>}
        <div className="grid grid-cols-2 gap-3">
          {cards.map((c) => (
            <button key={c.id} onClick={() => setActionFor(c)} className="overflow-hidden rounded-xl bg-card text-left active:scale-[0.98]">
              <div className="aspect-square bg-muted">
                {c.image_url ? <img src={c.image_url} className="h-full w-full object-cover" alt={c.name} /> : <div className="h-full w-full bg-gradient-to-br from-primary/20 to-accent" />}
              </div>
              <div className="p-2">
                <p className="line-clamp-1 text-sm font-semibold">{c.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {c.category || "—"}{c.condition && ` • ${c.condition}`}
                </p>
                <p className="mt-0.5 text-xs font-bold text-primary">${Number(c.estimated_value || 0).toFixed(2)}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Card action sheet */}
      {actionFor && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={() => setActionFor(null)}>
          <div className="w-full max-w-sm space-y-2 rounded-2xl bg-card p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="font-bold">{actionFor.name}</p>
              <button onClick={() => setActionFor(null)}><X className="h-4 w-4" /></button>
            </div>
            {actionFor.image_url && <img src={actionFor.image_url} className="mx-auto h-32 rounded-lg object-cover" alt="" />}
            <p className="text-xs text-muted-foreground">
              {actionFor.category || "—"}
              {actionFor.tcg_number && ` • #${actionFor.tcg_number}`}
              {actionFor.condition && ` • ${actionFor.condition}`}
              {` • Est. $${Number(actionFor.estimated_value || 0).toFixed(2)}`}
            </p>
            <button onClick={() => { setSelling(actionFor); setActionFor(null); }} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground">
              <Tag className="h-4 w-4" /> Sell this card
            </button>
            <button onClick={() => refreshValue(actionFor)} className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-sm font-semibold text-accent-foreground">
              <DollarSign className="h-4 w-4" /> Refresh value (TCG)
            </button>
            <button onClick={() => { setEditing(actionFor); setActionFor(null); }} className="flex w-full items-center justify-center gap-2 rounded-lg bg-muted py-2.5 text-sm">
              <Pencil className="h-4 w-4" /> Edit
            </button>
            <button onClick={() => { remove(actionFor.id); setActionFor(null); }} className="flex w-full items-center justify-center gap-2 rounded-lg bg-destructive/20 py-2.5 text-sm text-destructive">
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={() => setEditing(null)}>
          <div className="w-full max-w-md space-y-2 rounded-2xl bg-card p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="font-bold">Edit card</p>
              <button onClick={() => setEditing(null)}><X className="h-4 w-4" /></button>
            </div>
            {editing.image_url && <img src={editing.image_url} className="mx-auto h-32 rounded-lg object-cover" alt="" />}
            <label className="block">
              <span className="text-[10px] text-muted-foreground">Change image</span>
              <input type="file" accept="image/*" onChange={(e) => handleFile(e, (v) => setEditing({ ...editing, image_url: v }))} className="block w-full text-xs" />
            </label>
            <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="w-full rounded-lg bg-input px-3 py-2 text-sm" placeholder="TCG card name" />
            <div className="grid grid-cols-2 gap-2">
              <input value={editing.tcg_number || ""} onChange={(e) => setEditing({ ...editing, tcg_number: e.target.value })} className="rounded-lg bg-input px-3 py-2 text-sm" placeholder="Card #" />
              <input value={editing.tcg_set || ""} onChange={(e) => setEditing({ ...editing, tcg_set: e.target.value })} className="rounded-lg bg-input px-3 py-2 text-sm" placeholder="Set" />
            </div>
            <input value={editing.category || ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })} className="w-full rounded-lg bg-input px-3 py-2 text-sm" placeholder="Category" />
            <div>
              <p className="text-[10px] text-muted-foreground">Condition</p>
              <div className="mt-1 grid grid-cols-4 gap-1">
                {(["NM", "LP", "MP", "Damaged"] as const).map((c) => (
                  <button key={c} type="button" onClick={() => setEditing({ ...editing, condition: c })}
                    className={`rounded-lg px-2 py-1.5 text-xs font-bold ${editing.condition === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{c}</button>
                ))}
              </div>
            </div>
            <textarea rows={2} value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} className="w-full resize-none rounded-lg bg-input px-3 py-2 text-sm" placeholder="Description" />
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs">
                <p className="text-[9px] uppercase text-muted-foreground">Value (auto, TCG)</p>
                <p className="font-bold">${Number(editing.estimated_value || 0).toFixed(2)}</p>
              </div>
              <input type="number" min="0" step="0.01" value={editing.price ?? ""} onChange={(e) => setEditing({ ...editing, price: e.target.value === "" ? null : Number(e.target.value) })} className="rounded-lg bg-input px-3 py-2 text-sm" placeholder="My ask price ($)" />
            </div>
            <button onClick={saveEdit} className="w-full rounded-lg bg-primary py-2 text-sm font-bold text-primary-foreground">Save changes</button>
          </div>
        </div>
      )}

      {/* Sell modal */}
      {selling && <SellModal card={selling} onClose={() => setSelling(null)} onSubmit={(opts) => listForSale(selling, opts)} />}

      {scanning && <CardScanner onResult={onScanResult} onClose={() => setScanning(false)} />}
    </AppShell>
  );
}

function SellModal({ card, onClose, onSubmit }: {
  card: Card;
  onClose: () => void;
  onSubmit: (opts: { buy_now: boolean; auction: boolean; offer: boolean; days: number; price: number; reserve?: number }) => void;
}) {
  const [buyNow, setBuyNow] = useState(true);
  const [auction, setAuction] = useState(false);
  const [offer, setOffer] = useState(false);
  const [days, setDays] = useState(3);
  const [price, setPrice] = useState(String(card.price ?? card.estimated_value ?? 1));
  const [reserve, setReserve] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md space-y-3 rounded-2xl bg-card p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="font-bold">Sell "{card.name}"</p>
          <button onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        <p className="text-[11px] text-muted-foreground">Choose one or more listing options</p>
        <div className="space-y-2">
          <label className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
            <input type="checkbox" checked={buyNow} onChange={(e) => setBuyNow(e.target.checked)} className="h-4 w-4" /> Buy Now
          </label>
          <label className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
            <input type="checkbox" checked={offer} onChange={(e) => setOffer(e.target.checked)} className="h-4 w-4" /> Accept Offers
          </label>
          <label className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
            <input type="checkbox" checked={auction} onChange={(e) => setAuction(e.target.checked)} className="h-4 w-4" /> Auction
          </label>
          {auction && (
            <>
              <div>
                <p className="mb-1 text-[10px] uppercase text-muted-foreground">Auction length</p>
                <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-full rounded-lg bg-input px-3 py-2 text-sm">
                  {[1, 2, 3, 4, 5, 6, 7, 10, 14, 21, 30].map((d) => <option key={d} value={d}>{d} day{d > 1 ? "s" : ""}</option>)}
                </select>
              </div>
              <div>
                <p className="mb-1 text-[10px] uppercase text-muted-foreground">Reserve / minimum (optional)</p>
                <div className="flex items-center gap-2 rounded-lg bg-input px-3 py-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <input type="number" min="0" step="0.01" value={reserve} onChange={(e) => setReserve(e.target.value)} className="flex-1 bg-transparent text-sm outline-none" placeholder="No sale below this amount" />
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">If the top bid is below this, you'll be asked to accept or decline.</p>
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-input px-3 py-2">
          <DollarSign className="h-4 w-4 text-muted-foreground" />
          <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="flex-1 bg-transparent text-sm outline-none" placeholder={auction ? "Starting bid" : "Price"} />
        </div>
        <button
          onClick={() => {
            if (!buyNow && !auction && !offer) return toast.error("Pick at least one option");
            onSubmit({ buy_now: buyNow, auction, offer, days, price: Number(price) || 0, reserve: reserve ? Number(reserve) : undefined });
          }}
          className="w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground"
        >
          List for sale
        </button>
      </div>
    </div>
  );
}

