import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Lock, TrendingUp, TrendingDown } from "lucide-react";

type PurchasePatch = {
  purchase_price: number | null;
  purchase_date: string | null;
  purchased_from: string | null;
};

export function PurchaseInfoPanel({
  cardId,
  marketValue,
  initial,
  onSaved,
}: {
  cardId: string;
  marketValue: number;
  initial: { purchase_price?: number | null; purchase_date?: string | null; purchased_from?: string | null };
  onSaved: (patch: PurchasePatch) => void;
}) {
  const [price, setPrice] = useState(initial.purchase_price != null ? String(initial.purchase_price) : "");
  const [date, setDate] = useState(initial.purchase_date || "");
  const [from, setFrom] = useState(initial.purchased_from || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPrice(initial.purchase_price != null ? String(initial.purchase_price) : "");
    setDate(initial.purchase_date || "");
    setFrom(initial.purchased_from || "");
  }, [cardId]);

  const paid = Number(initial.purchase_price);
  const hasPaid = initial.purchase_price != null && !Number.isNaN(paid);
  const profit = hasPaid ? marketValue - paid : 0;

  async function save() {
    setSaving(true);
    const patch: PurchasePatch = {
      purchase_price: price.trim() === "" ? null : Number(price),
      purchase_date: date.trim() === "" ? null : date,
      purchased_from: from.trim() === "" ? null : from.trim(),
    };
    const { error } = await supabase.from("vault_cards").update(patch as never).eq("id", cardId);
    setSaving(false);
    if (error) { toast.error("Couldn't save purchase info"); return; }
    onSaved(patch);
    toast.success("Purchase info saved");
  }

  return (
    <div className="space-y-2 rounded-xl bg-muted/40 p-3">
      <p className="flex items-center gap-1.5 text-xs font-bold text-foreground">
        <Lock className="h-3.5 w-3.5 text-muted-foreground" /> Purchase Information
        <span className="ml-auto text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Only you can see this</span>
      </p>

      {/* Value comparison */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-background/60 p-2">
          <p className="text-[9px] uppercase text-muted-foreground">Market Value</p>
          <p className="text-sm font-bold text-foreground">${marketValue.toFixed(2)}</p>
        </div>
        <div className="rounded-lg bg-background/60 p-2">
          <p className="text-[9px] uppercase text-muted-foreground">Purchased For</p>
          <p className="text-sm font-bold text-foreground">{hasPaid ? `$${paid.toFixed(2)}` : "—"}</p>
        </div>
        <div className="rounded-lg bg-background/60 p-2">
          <p className="text-[9px] uppercase text-muted-foreground">Profit / Loss</p>
          {hasPaid ? (
            <p className={`flex items-center justify-center gap-0.5 text-sm font-bold ${profit >= 0 ? "text-emerald-500" : "text-destructive"}`}>
              {profit >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {profit >= 0 ? "+" : "-"}${Math.abs(profit).toFixed(2)}
            </p>
          ) : <p className="text-sm font-bold text-muted-foreground">—</p>}
        </div>
      </div>

      {/* Editor */}
      <div className="space-y-2">
        <div>
          <label className="text-[9px] uppercase text-muted-foreground">Purchase Price</label>
          <div className="mt-1 flex items-center gap-1 rounded-md bg-input px-2">
            <span className="text-xs text-muted-foreground">$</span>
            <input
              type="number" inputMode="decimal" step="0.01" min="0"
              value={price} onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              className="w-full bg-transparent py-1.5 text-xs outline-none"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[9px] uppercase text-muted-foreground">Purchase Date (optional)</label>
            <input
              type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded-md bg-input px-2 py-1.5 text-xs outline-none"
            />
          </div>
          <div>
            <label className="text-[9px] uppercase text-muted-foreground">Purchased From (optional)</label>
            <input
              type="text" value={from} onChange={(e) => setFrom(e.target.value)}
              placeholder="eBay, friend, shop…"
              className="mt-1 w-full rounded-md bg-input px-2 py-1.5 text-xs outline-none"
            />
          </div>
        </div>
        <button
          onClick={save} disabled={saving}
          className="w-full rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save purchase info"}
        </button>
      </div>
    </div>
  );
}
