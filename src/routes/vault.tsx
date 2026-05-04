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
type Card = {
  id: string; user_id: string; name: string; category: string | null;
  image_url: string | null; description: string | null;
  estimated_value: number | null; price: number | null;
  tcg_number?: string | null; tcg_set?: string | null;
  condition?: Condition | null;
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
  const [category, setCategory] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [description, setDescription] = useState("");
  const [estValue, setEstValue] = useState("");
  const [price, setPrice] = useState("");

  async function load() {
    if (!user) return;
    const { data } = await supabase.from("vault_cards").select("*").order("created_at", { ascending: false });
    setCards((data || []) as Card[]);
  }
  useEffect(() => { load(); }, [user]);

  const totalValue = useMemo(
    () => cards.reduce((s, c) => s + Number(c.estimated_value || 0), 0),
    [cards]
  );

  function resetForm() {
    setName(""); setCategory(""); setImageUrl(""); setDescription(""); setEstValue(""); setPrice("");
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>, setter: (v: string) => void) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setter(String(reader.result));
    reader.readAsDataURL(f);
  }

  async function add() {
    if (!name.trim()) return toast.error("Card name required");
    let identified = { name, category: category || "Trading Card", estimated_value: Number(estValue) || 0 };
    // If user typed but didn't scan/value, try TCG identification + valuation via AI
    if (!estValue || !category) {
      try {
        const { data, error } = await supabase.functions.invoke("identify-card", { body: { query: name } });
        if (!error && data) {
          identified = {
            name: data.name || name,
            category: category || data.category || "Trading Card",
            estimated_value: Number(estValue) || Number(data.estimated_value) || 0,
          };
          toast.success(`Identified: ${identified.name} (~$${identified.estimated_value})`);
        }
      } catch {/* ignore */}
    }
    const { error } = await supabase.from("vault_cards").insert({
      user_id: user!.id, name: identified.name, category: identified.category, image_url: imageUrl || null,
      description: description || null,
      estimated_value: identified.estimated_value,
      price: price ? Number(price) : null,
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
    const { error } = await supabase.from("vault_cards").update({
      name: editing.name, category: editing.category, image_url: editing.image_url,
      description: editing.description,
      estimated_value: Number(editing.estimated_value) || 0,
      price: editing.price != null ? Number(editing.price) : null,
    }).eq("id", editing.id);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    setEditing(null);
    load();
  }

  function onScanResult(r: { name: string; category: string; trend: string; image: string }) {
    setName(r.name); setCategory(r.category); setImageUrl(r.image);
    setScanning(false); setShowAdd(true);
    toast.success(`Identified: ${r.name}`);
  }

  async function listForSale(card: Card, opts: { buy_now: boolean; auction: boolean; offer: boolean; days: number; price: number }) {
    if (!profile?.is_seller) await supabase.from("profiles").update({ is_seller: true }).eq("id", user!.id);
    // Pick a primary type for required fields
    const primary: "buy_now" | "auction" | "offer" = opts.auction ? "auction" : opts.buy_now ? "buy_now" : "offer";
    const { data, error } = await supabase.from("listings").insert({
      seller_id: user!.id, title: card.name,
      description: card.description || `From my vault — ${card.category || "Trading Card"}`,
      image_url: card.image_url,
      listing_type: primary,
      is_auction: opts.auction,
      accepts_offers: opts.offer,
      price: opts.buy_now ? opts.price : null,
      starting_bid: opts.auction ? Math.max(1, opts.price || 1) : null,
      current_bid: opts.auction ? Math.max(1, opts.price || 1) : null,
      auction_ends_at: opts.auction ? new Date(Date.now() + opts.days * 24 * 60 * 60 * 1000).toISOString() : null,
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
            {imageUrl && <img src={imageUrl} className="mx-auto h-32 rounded-lg object-cover" alt="" />}
            <label className="block">
              <span className="text-[10px] text-muted-foreground">Image</span>
              <input type="file" accept="image/*" onChange={(e) => handleFile(e, setImageUrl)} className="block w-full text-xs" />
            </label>
            <input className="w-full rounded-lg bg-input px-3 py-2 text-sm" placeholder="Card name" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="w-full rounded-lg bg-input px-3 py-2 text-sm" placeholder="Category" value={category} onChange={(e) => setCategory(e.target.value)} />
            <textarea rows={2} className="w-full resize-none rounded-lg bg-input px-3 py-2 text-sm" placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <input type="number" min="0" step="0.01" className="rounded-lg bg-input px-3 py-2 text-sm" placeholder="Est. value ($)" value={estValue} onChange={(e) => setEstValue(e.target.value)} />
              <input type="number" min="0" step="0.01" className="rounded-lg bg-input px-3 py-2 text-sm" placeholder="My price ($)" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
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
                <p className="text-[10px] text-muted-foreground">{c.category || "—"}</p>
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
            <p className="text-xs text-muted-foreground">{actionFor.category || "—"} • Est. ${Number(actionFor.estimated_value || 0).toFixed(2)}</p>
            <button onClick={() => { setSelling(actionFor); setActionFor(null); }} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground">
              <Tag className="h-4 w-4" /> Sell this card
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
            <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="w-full rounded-lg bg-input px-3 py-2 text-sm" placeholder="Name" />
            <input value={editing.category || ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })} className="w-full rounded-lg bg-input px-3 py-2 text-sm" placeholder="Category" />
            <textarea rows={2} value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} className="w-full resize-none rounded-lg bg-input px-3 py-2 text-sm" placeholder="Description" />
            <div className="grid grid-cols-2 gap-2">
              <input type="number" min="0" step="0.01" value={editing.estimated_value ?? 0} onChange={(e) => setEditing({ ...editing, estimated_value: Number(e.target.value) })} className="rounded-lg bg-input px-3 py-2 text-sm" placeholder="Est. value ($)" />
              <input type="number" min="0" step="0.01" value={editing.price ?? ""} onChange={(e) => setEditing({ ...editing, price: e.target.value === "" ? null : Number(e.target.value) })} className="rounded-lg bg-input px-3 py-2 text-sm" placeholder="My price ($)" />
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
  onSubmit: (opts: { buy_now: boolean; auction: boolean; offer: boolean; days: number; price: number }) => void;
}) {
  const [buyNow, setBuyNow] = useState(true);
  const [auction, setAuction] = useState(false);
  const [offer, setOffer] = useState(false);
  const [days, setDays] = useState(3);
  const [price, setPrice] = useState(String(card.price ?? card.estimated_value ?? 1));

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
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-full rounded-lg bg-input px-3 py-2 text-sm">
              {[1, 2, 3, 4, 5, 6, 7].map((d) => <option key={d} value={d}>{d} day{d > 1 ? "s" : ""}</option>)}
            </select>
          )}
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-input px-3 py-2">
          <DollarSign className="h-4 w-4 text-muted-foreground" />
          <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="flex-1 bg-transparent text-sm outline-none" placeholder={auction ? "Starting bid" : "Price"} />
        </div>
        <button
          onClick={() => {
            if (!buyNow && !auction && !offer) return toast.error("Pick at least one option");
            onSubmit({ buy_now: buyNow, auction, offer, days, price: Number(price) || 0 });
          }}
          className="w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground"
        >
          List for sale
        </button>
      </div>
    </div>
  );
}
