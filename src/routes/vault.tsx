import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { Trash2, Plus, Camera, Tag } from "lucide-react";
import { toast } from "sonner";
import { CardScanner } from "@/components/CardScanner";

export const Route = createFileRoute("/vault")({ component: Vault });

function Vault() {
  const { user, profile } = useAuth();
  const nav = useNavigate();
  const [cards, setCards] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  async function load() {
    if (!user) return;
    const { data } = await supabase.from("vault_cards").select("*").order("created_at", { ascending: false });
    setCards(data || []);
  }
  useEffect(() => { load(); }, [user]);

  async function add() {
    if (!name.trim()) return;
    await supabase.from("vault_cards").insert({ user_id: user!.id, name, category, image_url: imageUrl || null });
    setName(""); setCategory(""); setImageUrl(""); setShowAdd(false);
    load();
  }
  async function remove(id: string) {
    await supabase.from("vault_cards").delete().eq("id", id);
    load();
  }

  function onScanResult(r: { name: string; category: string; trend: string; image: string }) {
    setName(r.name); setCategory(r.category); setImageUrl(r.image);
    setScanning(false); setShowAdd(true);
    toast.success(`Identified: ${r.name}`);
  }

  async function listForSale(card: any, type: "buy_now" | "auction" | "offer") {
    if (!profile?.is_seller) await supabase.from("profiles").update({ is_seller: true }).eq("id", user!.id);
    const { data, error } = await supabase.from("listings").insert({
      seller_id: user!.id, title: card.name, description: `From my vault — ${card.category || "Trading Card"}`,
      image_url: card.image_url,
      listing_type: type, is_auction: type === "auction", accepts_offers: type === "offer",
      price: type !== "auction" ? 0 : null,
      starting_bid: type === "auction" ? 1 : null, current_bid: type === "auction" ? 1 : null,
    }).select().single();
    if (error) return toast.error(error.message);
    toast.success("Listed — set your price");
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
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold">My Vault</h1>
          <div className="flex gap-2">
            <button onClick={() => setScanning(true)} className="flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground"><Camera className="h-3 w-3" /> Scan</button>
            <button onClick={() => setShowAdd(true)} className="flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"><Plus className="h-3 w-3" /> Add</button>
          </div>
        </div>

        {showAdd && (
          <div className="mb-4 space-y-2 rounded-xl bg-card p-3">
            {imageUrl && <img src={imageUrl} className="mx-auto h-32 rounded-lg object-cover" alt="" />}
            <input className="w-full rounded-lg bg-input px-3 py-2 text-sm" placeholder="Card name" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="w-full rounded-lg bg-input px-3 py-2 text-sm" placeholder="Category" value={category} onChange={(e) => setCategory(e.target.value)} />
            <div className="flex gap-2">
              <button onClick={add} className="flex-1 rounded-lg bg-primary py-2 text-sm font-bold text-primary-foreground">Save</button>
              <button onClick={() => { setShowAdd(false); setImageUrl(""); }} className="rounded-lg bg-muted px-3 py-2 text-sm">Cancel</button>
            </div>
          </div>
        )}

        {cards.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">Your vault is empty</p>}
        <div className="grid grid-cols-2 gap-3">
          {cards.map((c) => (
            <div key={c.id} className="overflow-hidden rounded-xl bg-card">
              <div className="aspect-square bg-muted">
                {c.image_url ? <img src={c.image_url} className="h-full w-full object-cover" alt={c.name} /> : <div className="h-full w-full bg-gradient-to-br from-primary/20 to-accent" />}
              </div>
              <div className="p-2">
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0">
                    <p className="line-clamp-1 text-sm font-semibold">{c.name}</p>
                    <p className="text-[10px] text-muted-foreground">{c.category}</p>
                  </div>
                  <button onClick={() => remove(c.id)} className="text-muted-foreground"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
                <div className="mt-2 flex gap-1">
                  <button onClick={() => listForSale(c, "buy_now")} className="flex-1 rounded-md bg-primary/20 py-1 text-[10px] font-semibold text-primary">Sell</button>
                  <button onClick={() => listForSale(c, "auction")} className="flex-1 rounded-md bg-primary/20 py-1 text-[10px] font-semibold text-primary">Auction</button>
                  <button onClick={() => listForSale(c, "offer")} className="flex-1 rounded-md bg-primary/20 py-1 text-[10px] font-semibold text-primary"><Tag className="mx-auto h-3 w-3" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      {scanning && <CardScanner onResult={onScanResult} onClose={() => setScanning(false)} />}
    </AppShell>
  );
}
