import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { listWishlist, addWishlistItem, updateWishlistItem, removeWishlistItem } from "@/lib/wishlist.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Heart, Plus, Trash2, Tag, ArrowLeftRight, Radio, Bell } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/wishlist")({
  head: () => ({
    meta: [
      { title: "Wishlist — PullBid Live" },
      { name: "description", content: "Track the cards you want and get notified the moment they're listed for sale, available to trade, or featured in a live show." },
    ],
  }),
  component: WishlistPage,
});

type WishItem = Awaited<ReturnType<typeof listWishlist>>[number];
type AddInput = {
  name: string;
  set_name?: string | null;
  tcg_number?: string | null;
  category?: string | null;
  max_price?: number | null;
  notify_sale: boolean;
  notify_trade: boolean;
  notify_live: boolean;
};

function WishlistPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);

  const list = useServerFn(listWishlist);
  const add = useServerFn(addWishlistItem);
  const remove = useServerFn(removeWishlistItem);
  const update = useServerFn(updateWishlistItem);

  const q = useQuery({ queryKey: ["wishlist"], queryFn: () => list(), enabled: !!user });

  const addMut = useMutation({
    mutationFn: (input: AddInput) => add({ data: input }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wishlist"] }); setAdding(false); toast.success("Added to wishlist"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wishlist"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggleMut = useMutation({
    mutationFn: (input: { id: string; field: "notify_sale" | "notify_trade" | "notify_live"; value: boolean }) =>
      update({ data: { id: input.id, [input.field]: input.value } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wishlist"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (!user) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md p-6 text-center">
          <Heart className="mx-auto h-10 w-10 text-muted-foreground" />
          <h1 className="mt-3 text-xl font-bold">Wishlist</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to track cards and get notified when they appear.</p>
          <Button asChild className="mt-4"><Link to="/auth">Sign in</Link></Button>
        </div>
      </AppShell>
    );
  }

  const items = q.data ?? [];

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <header className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Heart className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-xl font-bold">Wishlist</h1>
              <p className="text-xs text-muted-foreground">Get alerted when a wanted card is listed, tradeable, or live.</p>
            </div>
          </div>
          <Button size="sm" onClick={() => setAdding(true)}><Plus className="mr-1 h-4 w-4" /> Add</Button>
        </header>

        {q.isLoading && <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>}

        {!q.isLoading && items.length === 0 && (
          <Card className="p-8 text-center">
            <Heart className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-3 font-medium">Your wishlist is empty</p>
            <p className="mt-1 text-sm text-muted-foreground">Add the cards you're hunting for and we'll watch the marketplace for you.</p>
            <Button className="mt-4" onClick={() => setAdding(true)}><Plus className="mr-1 h-4 w-4" /> Add a card</Button>
          </Card>
        )}

        <div className="space-y-3">
          {items.map((item) => (
            <WishRow
              key={item.id}
              item={item}
              onRemove={() => removeMut.mutate(item.id)}
              onToggle={(field, value) => toggleMut.mutate({ id: item.id, field, value })}
            />
          ))}
        </div>
      </div>

      <AddDialog open={adding} onOpenChange={setAdding} onSubmit={(v) => addMut.mutate(v)} submitting={addMut.isPending} />
    </AppShell>
  );
}

function WishRow({
  item,
  onRemove,
  onToggle,
}: {
  item: WishItem;
  onRemove: () => void;
  onToggle: (field: "notify_sale" | "notify_trade" | "notify_live", value: boolean) => void;
}) {
  return (
    <Card className="flex gap-3 p-3">
      <div className="h-20 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
        {item.image_url ? <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" loading="lazy" /> : <div className="flex h-full w-full items-center justify-center"><Heart className="h-5 w-5 text-muted-foreground" /></div>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-semibold">{item.name}</p>
            <p className="text-xs text-muted-foreground">
              {[item.set_name, item.tcg_number ? `#${item.tcg_number}` : null].filter(Boolean).join(" · ") || "Any printing"}
              {item.max_price ? ` · up to $${Number(item.max_price).toLocaleString()}` : ""}
            </p>
          </div>
          <button onClick={onRemove} aria-label="Remove" className="shrink-0 text-muted-foreground hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-3">
          <ToggleChip icon={<Tag className="h-3 w-3" />} label="Sale" checked={item.notify_sale} onChange={(v) => onToggle("notify_sale", v)} />
          <ToggleChip icon={<ArrowLeftRight className="h-3 w-3" />} label="Trade" checked={item.notify_trade} onChange={(v) => onToggle("notify_trade", v)} />
          <ToggleChip icon={<Radio className="h-3 w-3" />} label="Live" checked={item.notify_live} onChange={(v) => onToggle("notify_live", v)} />
        </div>
      </div>
    </Card>
  );
}

function ToggleChip({ icon, label, checked, onChange }: { icon: React.ReactNode; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-xs">
      <span className={`flex items-center gap-1 ${checked ? "text-foreground" : "text-muted-foreground"}`}>{icon}{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} className="scale-75" />
    </label>
  );
}

function AddDialog({
  open,
  onOpenChange,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (v: { name: string; set_name?: string | null; tcg_number?: string | null; category?: string | null; max_price?: number | null; notify_sale: boolean; notify_trade: boolean; notify_live: boolean }) => void;
  submitting: boolean;
}) {
  const [name, setName] = useState("");
  const [cardSet, setCardSet] = useState("");
  const [number, setNumber] = useState("");
  const [category, setCategory] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [notifySale, setNotifySale] = useState(true);
  const [notifyTrade, setNotifyTrade] = useState(true);
  const [notifyLive, setNotifyLive] = useState(false);

  const reset = () => { setName(""); setSetName(""); setNumber(""); setCategory(""); setMaxPrice(""); setNotifySale(true); setNotifyTrade(true); setNotifyLive(false); };

  const submit = () => {
    if (!name.trim()) { toast.error("Card name is required"); return; }
    onSubmit({
      name: name.trim(),
      set_name: setName.trim() || null,
      tcg_number: number.trim() || null,
      category: category.trim() || null,
      max_price: maxPrice ? Number(maxPrice) : null,
      notify_sale: notifySale,
      notify_trade: notifyTrade,
      notify_live: notifyLive,
    });
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>Add to wishlist</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Card name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Charizard" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Set</Label>
              <Input value={setName} onChange={(e) => setSetName(e.target.value)} placeholder="Base Set" />
            </div>
            <div>
              <Label className="text-xs">Card #</Label>
              <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="4/102" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Category</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Pokémon" />
            </div>
            <div>
              <Label className="text-xs">Max price ($)</Label>
              <Input type="number" min="0" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="Any" />
            </div>
          </div>
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Bell className="h-3 w-3" /> Notify me when</p>
            <div className="space-y-2">
              <Row label="Listed for sale"><Switch checked={notifySale} onCheckedChange={setNotifySale} /></Row>
              <Row label="Available to trade"><Switch checked={notifyTrade} onCheckedChange={setNotifyTrade} /></Row>
              <Row label="Featured in a live show"><Switch checked={notifyLive} onCheckedChange={setNotifyLive} /></Row>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">Tip: add a set + card number for precise matches, or just a name to catch every printing.</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>{submitting ? "Adding…" : "Add card"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span>{label}</span>
      {children}
    </div>
  );
}
