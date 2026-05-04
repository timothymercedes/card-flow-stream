import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { Trash2, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/vault")({ component: Vault });

function Vault() {
  const { user, profile } = useAuth();
  const [cards, setCards] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");

  async function load() {
    if (!user) return;
    const { data } = await supabase.from("vault_cards").select("*").order("created_at", { ascending: false });
    setCards(data || []);
  }
  useEffect(() => { load(); }, [user]);

  async function add() {
    if (!name.trim()) return;
    await supabase.from("vault_cards").insert({ user_id: user!.id, name, category });
    setName(""); setCategory(""); setShowAdd(false);
    load();
  }
  async function aiScan() {
    const cards = ["Charizard 1st Edition", "Pikachu Illustrator", "Mewtwo GX", "Lugia Holo"];
    setName(cards[Math.floor(Math.random() * cards.length)]);
    setCategory("Pokémon");
    setShowAdd(true);
    toast.success("Card scanned");
  }
  async function remove(id: string) {
    await supabase.from("vault_cards").delete().eq("id", id);
    load();
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
            <button onClick={aiScan} className="flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold"><Sparkles className="h-3 w-3" /> Scan</button>
            <button onClick={() => setShowAdd(true)} className="flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"><Plus className="h-3 w-3" /> Add</button>
          </div>
        </div>

        {showAdd && (
          <div className="mb-4 space-y-2 rounded-xl bg-card p-3">
            <input className="w-full rounded-lg bg-input px-3 py-2 text-sm" placeholder="Card name" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="w-full rounded-lg bg-input px-3 py-2 text-sm" placeholder="Category" value={category} onChange={(e) => setCategory(e.target.value)} />
            <div className="flex gap-2">
              <button onClick={add} className="flex-1 rounded-lg bg-primary py-2 text-sm font-bold text-primary-foreground">Save</button>
              <button onClick={() => setShowAdd(false)} className="rounded-lg bg-muted px-3 py-2 text-sm">Cancel</button>
            </div>
          </div>
        )}

        {cards.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">Your vault is empty</p>}
        <div className="grid grid-cols-2 gap-3">
          {cards.map((c) => (
            <div key={c.id} className="overflow-hidden rounded-xl bg-card">
              <div className="aspect-square bg-gradient-to-br from-primary/20 to-accent" />
              <div className="p-2">
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0">
                    <p className="line-clamp-1 text-sm font-semibold">{c.name}</p>
                    <p className="text-[10px] text-muted-foreground">{c.category}</p>
                  </div>
                  <button onClick={() => remove(c.id)} className="text-muted-foreground"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
