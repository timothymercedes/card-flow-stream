import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { SellerAgreementGate } from "@/components/SellerAgreementGate";
import { SellerVerificationGate } from "@/components/SellerVerificationGate";
import { ListingPhotoManager } from "@/components/ListingPhotoManager";
import { Button } from "@/components/ui/button";
import { LISTING_CATEGORIES } from "@/lib/listingCategories";
import { bulkItemToListing, validateBulkItem, type BulkItem } from "@/lib/bulkListings";
import { MAX_LISTING_PHOTOS } from "@/lib/listingPhotos";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/sell_/bulk")({
  component: BulkSell,
  head: () => ({ meta: [
    { title: "Bulk listing — PullBid Live" },
    { name: "description", content: "Create many separate Marketplace sale and trade listings from your Vault in one batch." },
    { property: "og:title", content: "Bulk listing — PullBid Live" },
    { property: "og:description", content: "Create many separate Marketplace listings from your Vault at once." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
});

type VaultRow = { id: string; name: string; category: string | null; condition: string | null; estimated_value: number | null; visibility: string | null; accept_trades: boolean | null; trade_plus_cash: boolean | null; tcg_set: string | null; tcg_number: string | null };
const CONDS = ["NM", "LP", "MP", "Damaged"] as const;
const catKeys = new Set<string>(LISTING_CATEGORIES.map((c) => c.value));

function BulkSell() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState<"pick" | "details" | "review">("pick");
  const [vault, setVault] = useState<VaultRow[] | null>(null);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [items, setItems] = useState<BulkItem[]>([]);
  const [tray, setTray] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (!user) return;
    void supabase.from("vault_cards").select("id,name,category,condition,estimated_value,visibility,accept_trades,trade_plus_cash,tcg_set,tcg_number")
      .eq("user_id", user.id).eq("status", "available").eq("is_sold", false).eq("collection_only", false)
      .order("created_at", { ascending: false }).limit(500)
      .then(({ data, error }) => { if (error) toast.error("Vault could not be loaded"); setVault((data as VaultRow[]) ?? []); });
  }, [user]);

  const filtered = useMemo(() => (vault ?? []).filter((v) => v.name.toLowerCase().includes(q.toLowerCase())), [vault, q]);

  function toDetails() {
    const rows = (vault ?? []).filter((v) => picked.has(v.id));
    setItems((prev) => rows.map((v) => prev.find((p) => p.vaultId === v.id) ?? {
      vaultId: v.id, title: [v.name, v.tcg_set, v.tcg_number].filter(Boolean).join(" · "), photos: [],
      price: v.estimated_value ? String(v.estimated_value) : "", condition: (CONDS as readonly string[]).includes(v.condition ?? "") ? (v.condition as BulkItem["condition"]) : "NM",
      quantity: "1", sell: true, offers: false, trade: false,
      tradeEligible: v.visibility === "public" && !!(v.accept_trades || v.trade_plus_cash),
      category: catKeys.has(v.category ?? "") ? v.category! : "other",
    }));
    setStep("details");
  }

  const update = (id: string, patch: Partial<BulkItem>) => setItems((all) => all.map((it) => (it.vaultId === id ? { ...it, ...patch } : it)));

  function assign(url: string, id: string) {
    const it = items.find((i) => i.vaultId === id);
    if (!it) return;
    if (it.photos.length >= MAX_LISTING_PHOTOS) return toast.error("That item already has 10 photos");
    update(id, { photos: [...it.photos, url] });
    setTray((t) => t.filter((u) => u !== url));
  }

  const errors = items.map((it) => validateBulkItem(it));
  const ready = items.length > 0 && errors.every((e) => !e);

  async function publish() {
    if (!user || !ready || publishing) return;
    setPublishing(true);
    try {
      const { data: prof } = await supabase.from("profiles").select("is_seller").eq("id", user.id).maybeSingle();
      if (!prof?.is_seller) await supabase.from("profiles").update({ is_seller: true }).eq("id", user.id);
      // One insert = all listings publish together or none do.
      const { error } = await supabase.from("listings").insert(items.map((it) => bulkItemToListing(it, user.id)) as any);
      if (error) return toast.error(`Batch not published: ${error.message}`);
      toast.success(`${items.length} listings published`);
      nav({ to: "/my-listings" });
    } finally { setPublishing(false); }
  }

  return (
    <SellerAgreementGate><SellerVerificationGate><AppShell>
      <div className="mx-auto max-w-3xl px-4 py-4 pb-40">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold">Bulk listing</h1>
          <Link to="/sell" className="text-xs text-primary underline">Single listing</Link>
        </div>
        <ol className="mb-4 flex gap-2 text-xs font-semibold" aria-label="Steps">
          {(["pick", "details", "review"] as const).map((s, i) => <li key={s} className={`flex-1 rounded-lg px-2 py-1.5 text-center ${step === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{i + 1}. {s === "pick" ? "Choose items" : s === "details" ? "Photos & prices" : "Review"}</li>)}
        </ol>

        {step === "pick" && <section>
          <input aria-label="Search Vault" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your Vault" className="mb-3 w-full rounded-xl bg-input px-3 py-3 text-sm outline-none" />
          {!vault ? <p className="text-sm text-muted-foreground"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" />Loading Vault…</p> :
            filtered.length === 0 ? <p className="text-sm text-muted-foreground">No available Vault items. <Link to="/vault" className="text-primary underline">Add items to your Vault</Link></p> :
            <ul className="grid gap-2 sm:grid-cols-2">{filtered.map((v) => <li key={v.id}><label className="flex cursor-pointer items-center gap-3 rounded-xl bg-card p-3 ring-1 ring-border">
              <input type="checkbox" className="h-5 w-5" checked={picked.has(v.id)} onChange={(e) => setPicked((s) => { const n = new Set(s); e.target.checked ? n.add(v.id) : n.delete(v.id); return n; })} />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{v.name}</span><span className="text-[11px] text-muted-foreground">{v.estimated_value ? `$${v.estimated_value}` : "No value"}{v.visibility === "public" && (v.accept_trades || v.trade_plus_cash) ? " · Trade-ready" : ""}</span></span>
            </label></li>)}</ul>}
          <div className="fixed inset-x-0 bottom-20 z-30 mx-auto max-w-3xl px-4"><Button className="w-full" disabled={picked.size === 0} onClick={toDetails}>Continue with {picked.size} item{picked.size === 1 ? "" : "s"}</Button></div>
        </section>}

        {step === "details" && <section className="space-y-4">
          <div className="rounded-xl bg-card p-3 ring-1 ring-border">
            <p className="mb-2 text-sm font-semibold">Photo tray (optional)</p>
            <p className="mb-2 text-[11px] text-muted-foreground">Upload many photos at once, then assign each photo to the right item. Items are never merged.</p>
            <ListingPhotoManager value={tray} onChange={setTray} label="Unassigned photos" required={false} />
            {tray.length > 0 && <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{tray.map((u) => <li key={u} className="rounded-lg bg-muted p-1">
              <img src={u} alt="Unassigned" className="aspect-square w-full rounded object-cover" />
              <select aria-label="Assign photo to item" className="mt-1 w-full rounded bg-input px-1 py-1 text-[11px]" value="" onChange={(e) => e.target.value && assign(u, e.target.value)}>
                <option value="">Assign to…</option>{items.map((it) => <option key={it.vaultId} value={it.vaultId}>{it.title}</option>)}
              </select></li>)}</ul>}
          </div>
          {items.map((it, idx) => <article key={it.vaultId} className="rounded-xl bg-card p-3 ring-1 ring-border" aria-label={`Item ${idx + 1}`}>
            <input aria-label={`Title for item ${idx + 1}`} value={it.title} onChange={(e) => update(it.vaultId, { title: e.target.value })} className="mb-2 w-full rounded-lg bg-input px-3 py-2 text-sm font-semibold outline-none" />
            <ListingPhotoManager value={it.photos} onChange={(photos) => update(it.vaultId, { photos })} label="Photos" />
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className="text-[11px] font-semibold text-muted-foreground">Price ($)<input inputMode="decimal" disabled={!it.sell} value={it.price} onChange={(e) => update(it.vaultId, { price: e.target.value })} className="mt-1 w-full rounded-lg bg-input px-2 py-2 text-sm text-foreground outline-none disabled:opacity-50" /></label>
              <label className="text-[11px] font-semibold text-muted-foreground">Quantity<input inputMode="numeric" value={it.quantity} onChange={(e) => update(it.vaultId, { quantity: e.target.value })} className="mt-1 w-full rounded-lg bg-input px-2 py-2 text-sm text-foreground outline-none" /></label>
              <label className="text-[11px] font-semibold text-muted-foreground">Condition<select value={it.condition} onChange={(e) => update(it.vaultId, { condition: e.target.value as BulkItem["condition"] })} className="mt-1 w-full rounded-lg bg-input px-2 py-2 text-sm text-foreground">{CONDS.map((c) => <option key={c}>{c}</option>)}</select></label>
              <label className="text-[11px] font-semibold text-muted-foreground">Category<select value={it.category} onChange={(e) => update(it.vaultId, { category: e.target.value })} className="mt-1 w-full rounded-lg bg-input px-2 py-2 text-sm text-foreground">{LISTING_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></label>
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              <label className="flex items-center gap-1"><input type="checkbox" checked={it.sell} onChange={(e) => update(it.vaultId, { sell: e.target.checked })} /> Buy Now</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={it.offers} onChange={(e) => update(it.vaultId, { offers: e.target.checked })} /> Accept offers</label>
              <label className={`flex items-center gap-1 ${it.tradeEligible ? "" : "opacity-50"}`}><input type="checkbox" disabled={!it.tradeEligible} checked={it.trade} onChange={(e) => update(it.vaultId, { trade: e.target.checked })} /> Trade{!it.tradeEligible && " (make item public & trade-enabled in Vault)"}</label>
            </div>
            {errors[idx] && <p role="alert" className="mt-2 text-xs text-destructive">{errors[idx]}</p>}
          </article>)}
          <div className="fixed inset-x-0 bottom-20 z-30 mx-auto flex max-w-3xl gap-2 px-4">
            <Button variant="secondary" onClick={() => setStep("pick")}>Back</Button>
            <Button className="flex-1" disabled={!ready} onClick={() => setStep("review")}>{ready ? "Review batch" : `Fix ${errors.filter(Boolean).length} item(s)`}</Button>
          </div>
        </section>}

        {step === "review" && <section>
          <p className="mb-3 text-sm text-muted-foreground">{items.length} separate listings will publish together.</p>
          <ul className="space-y-2">{items.map((it) => <li key={it.vaultId} className="flex items-center gap-3 rounded-xl bg-card p-2 ring-1 ring-border">
            <img src={it.photos[0]} alt="" className="h-14 w-14 rounded object-cover" />
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{it.title}</p>
              <p className="text-[11px] text-muted-foreground">{it.photos.length} photos · {it.condition} · Qty {it.quantity} · {[it.sell && `$${Number(it.price).toFixed(2)}`, it.offers && "Offers", it.trade && "Trade"].filter(Boolean).join(" · ")}</p></div>
          </li>)}</ul>
          <div className="fixed inset-x-0 bottom-20 z-30 mx-auto flex max-w-3xl gap-2 px-4">
            <Button variant="secondary" onClick={() => setStep("details")}>Edit</Button>
            <Button className="flex-1" disabled={publishing} onClick={() => void publish()}>{publishing ? "Publishing…" : `Publish ${items.length} listings`}</Button>
          </div>
        </section>}
      </div>
    </AppShell></SellerVerificationGate></SellerAgreementGate>
  );
}
