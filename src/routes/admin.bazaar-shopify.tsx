import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Download } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { listShopifyProducts, importShopifyProducts } from "@/lib/shopifyImport.functions";
import { formatCents } from "@/lib/bazaar";

export const Route = createFileRoute("/admin/bazaar-shopify")({
  head: () => ({ meta: [
    { title: "Shopify import — PB Bazaar admin" }, { name: "description", content: "Import Shopify products into PB Bazaar Direct as drafts." },
    { property: "og:title", content: "Shopify import — PB Bazaar" }, { property: "og:description", content: "Admin Shopify catalog import." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: ShopifyImport,
});

type Row = { id: number; title: string; image: string | null; variants: number; fromCents: number; imported: boolean };

function ShopifyImport() {
  const list = useServerFn(listShopifyProducts);
  const run = useServerFn(importShopifyProducts);
  const [markup, setMarkup] = useState(20);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setBusy(true);
    try { const r = await list({ data: { markupPct: markup } }); if (r.error) toast.error(r.error); setRows(r.products); setPicked(new Set()); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  };
  const doImport = async () => {
    setBusy(true);
    try {
      const r = await run({ data: { ids: [...picked], markupPct: markup } });
      if (r.error) toast.error(r.error); else toast.success(`Imported ${r.imported} as drafts${r.skipped ? ` · ${r.skipped} already imported` : ""}`);
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); setBusy(false); }
  };
  return <AppShell><div className="mx-auto max-w-4xl space-y-4 px-3 py-5">
    <Link to="/admin/bazaar-suppliers" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Suppliers</Link>
    <h1 className="text-2xl font-black">Import from Shopify</h1>
    <p className="text-sm text-muted-foreground">Products land in PB Bazaar Direct as hidden drafts. Review and publish them from the Bazaar catalog.</p>
    <div className="flex flex-wrap items-end gap-3 rounded-xl bg-card p-3 ring-1 ring-border">
      <label className="text-sm font-semibold">Markup %<input type="number" min={0} max={500} value={markup} onChange={(e) => setMarkup(Math.max(0, Number(e.target.value) || 0))} className="mt-1 block w-24 rounded-lg border border-input bg-background px-2 py-1.5" /></label>
      <Button onClick={() => void load()} disabled={busy}>{rows ? "Refresh" : "Load Shopify products"}</Button>
      {rows && <Button variant="secondary" onClick={() => void doImport()} disabled={busy || !picked.size}><Download />Import {picked.size || ""} as drafts</Button>}
    </div>
    {rows && !rows.length && <p className="text-sm text-muted-foreground">No active products found.</p>}
    <div className="grid gap-2">{rows?.map((p) => <label key={p.id} className={`flex items-center gap-3 rounded-xl bg-card p-2 ring-1 ring-border ${p.imported ? "opacity-60" : ""}`}>
      <input type="checkbox" disabled={p.imported} checked={picked.has(p.id)} onChange={(e) => setPicked((s) => { const n = new Set(s); e.target.checked ? n.add(p.id) : n.delete(p.id); return n; })} />
      {p.image ? <img src={p.image} alt="" className="h-12 w-12 rounded object-cover" /> : <div className="h-12 w-12 rounded bg-muted" />}
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{p.title}</p><p className="text-xs text-muted-foreground">{p.variants} option{p.variants === 1 ? "" : "s"} · Bazaar price from {formatCents(p.fromCents)}{p.imported ? " · Already imported" : ""}</p></div>
    </label>)}</div>
  </div></AppShell>;
}
