import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Search, PlugZap, AlertTriangle, PackagePlus, Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatCents, BAZAAR_DEPARTMENTS } from "@/lib/bazaar";
import { DEMO_LABEL } from "@/lib/suppliers/cjImport";
import { getCJStatus, testCJConnection, searchCJProducts, getCJProductDetail, importCJProduct } from "@/lib/cjSupplier.functions";

type Summary = { ref: string; title: string; imageUrl: string | null; costCents: number | null; categoryName: string | null };
type Detail = NonNullable<Awaited<ReturnType<typeof getCJProductDetail>>["product"]>;

/** Clearly labeled samples so admins can try the screen before CJ is connected. Never importable. */
const DEMO_ITEMS: Summary[] = [
  { ref: "demo-1", title: "Sample: Insulated Water Bottle", imageUrl: null, costCents: 420, categoryName: "Home" },
  { ref: "demo-2", title: "Sample: Phone Stand", imageUrl: null, costCents: 180, categoryName: "Electronics" },
];
const DEMO_DETAIL: Detail = { ref: "demo-1", title: "Sample: Insulated Water Bottle", description: "Example layout only. This is not a CJ product.", images: [], categoryName: "Home", truncated: false,
  variants: [
    { vid: "demo-v1", sku: "SAMPLE-BLK-500", name: null, options: { Color: "Black", Size: "500ml" }, imageUrl: null, stock: 25, itemCostCents: 420, shippingCents: 350, shippingMethod: "Sample method", shippingDays: "8–14 days", shippingEstimated: false, shippingConfirmed: true, priceCents: 1199, profitCents: 360, marginPercent: 30, belowFloor: false },
    { vid: "demo-v2", sku: "SAMPLE-WHT-750", name: null, options: { Color: "White", Size: "750ml" }, imageUrl: null, stock: 0, itemCostCents: 510, shippingCents: 350, shippingMethod: "Sample method", shippingDays: "8–14 days", shippingEstimated: true, shippingConfirmed: false, priceCents: 1349, profitCents: 390, marginPercent: 29, belowFloor: false },
  ] };

export function CJDiscovery() {
  const qc = useQueryClient();
  const statusFn = useServerFn(getCJStatus), searchFn = useServerFn(searchCJProducts), detailFn = useServerFn(getCJProductDetail), importFn = useServerFn(importCJProduct);
  const testFn = useServerFn(testCJConnection);
  const [test, setTest] = useState<{ ok: boolean; loggedIn: boolean; refreshed: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const status = useQuery({ queryKey: ["cj", "status"], queryFn: () => statusFn(), staleTime: 60_000 });
  const [demo, setDemo] = useState(false);
  const [q, setQ] = useState({ keyword: "", pid: "", categoryId: "" });
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<{ items: Summary[]; total: number } | null>(null);
  const [searching, setSearching] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadingPid, setLoadingPid] = useState<string | null>(null);
  const connected = !!status.data?.ok && !!test?.ok;
  const isDemo = demo || !connected;

  async function runSearch(p = 1) {
    if (isDemo) { setResults({ items: DEMO_ITEMS, total: DEMO_ITEMS.length }); return; }
    setSearching(true); setPage(p);
    try { const r = await searchFn({ data: { keyword: q.keyword || undefined, pid: q.pid || undefined, categoryId: q.categoryId || undefined, page: p } }); if (r.error) toast.error(r.error); setResults({ items: r.items, total: r.total }); }
    finally { setSearching(false); }
  }
  async function open(ref: string) {
    if (isDemo) { setDetail(DEMO_DETAIL); return; }
    setLoadingPid(ref);
    try { const r = await detailFn({ data: { pid: ref } }); if (r.error || !r.product) toast.error(r.error ?? "Couldn't load product"); else setDetail(r.product); }
    finally { setLoadingPid(null); }
  }

  return <div className="space-y-4">
    <section className={`rounded-2xl p-4 ring-1 ${connected ? "bg-card ring-border" : "bg-muted ring-border"}`} aria-live="polite">
      <div className="flex flex-wrap items-center gap-2"><PlugZap className="h-5 w-5 text-primary" /><h2 className="font-bold">CJdropshipping connection</h2>
        {status.isLoading ? <span className="text-xs text-muted-foreground">Checking…</span> : <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${connected ? "bg-primary text-primary-foreground" : status.data?.configured && !test ? "bg-accent text-accent-foreground" : "bg-destructive text-destructive-foreground"}`}>{connected ? "Connected" : status.data?.configured && !test ? "Key added — not tested" : "Not connected"}</span>}
        {status.data?.sandbox && <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-accent-foreground">Safe mode</span>}
        <Button size="sm" variant="outline" disabled={testing || !status.data?.configured} onClick={async () => { setTesting(true); try { setTest(await testFn()); } finally { setTesting(false); } }}>{testing ? <Loader2 className="animate-spin" /> : <PlugZap />}Test connection</Button></div>
      <p className="mt-1 text-sm">{test ? test.message : status.data?.message ?? (status.error ? "Couldn't check the connection." : "")}</p>
      {test && <p className="mt-1 text-xs">Sign-in: <strong>{test.loggedIn ? "passed" : "failed"}</strong> · Access refresh: <strong>{test.refreshed ? "passed" : "failed"}</strong></p>}
      {status.data?.configured && !status.data.supplierRegistered && <p className="mt-1 text-xs text-destructive">CJdropshipping isn't registered as a supplier yet, so importing is off. Search and pricing still work.</p>}
      <p className="mt-1 text-xs text-muted-foreground">Importing creates drafts only. CJ ordering, cancellations and balance payments are off. Shoppers never see supplier names, costs or CJ IDs.</p>
      {connected && <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={demo} onChange={(e) => { setDemo(e.target.checked); setResults(null); setDetail(null); }} />Show the labeled demo instead</label>}
    </section>

    {isDemo && <p role="status" className="flex items-center gap-2 rounded-xl bg-accent p-3 text-sm font-semibold text-accent-foreground"><AlertTriangle className="h-4 w-4" />Demo mode — {DEMO_LABEL}. Importing is disabled.</p>}

    <form className="grid gap-2 rounded-2xl bg-card p-4 ring-1 ring-border sm:grid-cols-[1fr_1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); void runSearch(1); }}>
      <label className="text-xs">Keyword<Input value={q.keyword} onChange={(e) => setQ({ ...q, keyword: e.target.value })} placeholder="e.g. desk lamp" /></label>
      <label className="text-xs">CJ product ID<Input value={q.pid} onChange={(e) => setQ({ ...q, pid: e.target.value })} placeholder="Exact product ID" /></label>
      <label className="text-xs">CJ category ID<Input value={q.categoryId} onChange={(e) => setQ({ ...q, categoryId: e.target.value })} placeholder="Optional" /></label>
      <Button type="submit" className="self-end" disabled={searching}>{searching ? <Loader2 className="animate-spin" /> : <Search />}Search</Button>
    </form>

    {results && (!results.items.length ? <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground ring-1 ring-border">No products found.</p> : <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{results.items.map((it) => <li key={it.ref} className="flex flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-border">
        <div className="aspect-square bg-muted">{it.imageUrl ? <img src={it.imageUrl} alt={it.title} loading="lazy" className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center p-2 text-center text-xs text-muted-foreground">{isDemo ? "DEMO" : "No image"}</div>}</div>
        <div className="flex flex-1 flex-col gap-1 p-3"><p className="line-clamp-2 text-sm font-semibold">{it.title}</p><p className="text-xs text-muted-foreground">{it.categoryName ?? "—"}</p><p className="text-xs">Supplier cost from <strong>{it.costCents != null ? formatCents(it.costCents) : "—"}</strong></p>
          <Button size="sm" variant="outline" className="mt-auto" disabled={loadingPid === it.ref} onClick={() => void open(it.ref)}>{loadingPid === it.ref ? <Loader2 className="animate-spin" /> : <Eye />}View & price</Button></div>
      </li>)}</ul>
      {!isDemo && results.total > 20 && <div className="flex items-center justify-center gap-2"><Button size="sm" variant="outline" disabled={page <= 1 || searching} onClick={() => void runSearch(page - 1)}>Previous</Button><span className="text-xs">Page {page}</span><Button size="sm" variant="outline" disabled={page * 20 >= results.total || searching} onClick={() => void runSearch(page + 1)}>Next</Button></div>}
    </>)}

    {detail && <ProductPanel key={detail.ref} p={detail} demo={isDemo} onClose={() => setDetail(null)} onImport={async (input) => {
      const r = await importFn({ data: input });
      if (r.error) { toast.error(r.error); return false; }
      toast.success("Imported as a draft. Approve it on the Imports tab to publish.");
      qc.invalidateQueries({ queryKey: ["bazaar-sup"] }); setDetail(null); return true;
    }} />}
  </div>;
}

function ProductPanel({ p, demo, onClose, onImport }: { p: Detail; demo: boolean; onClose: () => void; onImport: (i: { pid: string; vids: string[]; title: string; description: string; department: string | null }) => Promise<boolean> }) {
  const [sel, setSel] = useState<Set<string>>(() => new Set(p.variants.filter((v) => (v.stock ?? 0) > 0).map((v) => v.vid)));
  const [title, setTitle] = useState(p.title.slice(0, 160));
  const [desc, setDesc] = useState(p.description);
  const [dept, setDept] = useState<string>("");
  const [img, setImg] = useState(0);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const chosen = p.variants.filter((v) => sel.has(v.vid));
  const toggle = (vid: string) => setSel((s) => { const n = new Set(s); n.has(vid) ? n.delete(vid) : n.add(vid); return n; });
  const optionNames = [...new Set(p.variants.flatMap((v) => Object.keys(v.options)))];

  return <section className="space-y-4 rounded-2xl bg-card p-4 ring-1 ring-primary" aria-label="Product details">
    {demo && <p className="rounded-lg bg-accent px-3 py-2 text-xs font-bold text-accent-foreground">{DEMO_LABEL}</p>}
    <div className="flex items-start justify-between gap-2"><h2 className="text-lg font-bold">{p.title}</h2><Button size="sm" variant="ghost" onClick={onClose}>Close</Button></div>
    <div className="grid gap-4 md:grid-cols-[260px_1fr]">
      <div className="space-y-2"><div className="aspect-square overflow-hidden rounded-xl bg-muted">{p.images[img] ? <img src={p.images[img]} alt={p.title} className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No image</div>}</div>
        {p.images.length > 1 && <div className="flex gap-1 overflow-x-auto">{p.images.map((u, i) => <button key={u} onClick={() => setImg(i)} aria-label={`Image ${i + 1}`} className={`h-12 w-12 shrink-0 overflow-hidden rounded ring-2 ${i === img ? "ring-primary" : "ring-transparent"}`}><img src={u} alt="" className="h-full w-full object-cover" /></button>)}</div>}
      </div>
      <div className="space-y-2 text-sm">
        <label className="block text-xs">Shopper title<Input value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="block text-xs">Department<select className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={dept} onChange={(e) => setDept(e.target.value)}><option value="">Choose later</option>{BAZAAR_DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}</select></label>
        <label className="block text-xs">Shopper description (plain text)<Textarea rows={5} value={desc} maxLength={5000} onChange={(e) => setDesc(e.target.value)} /></label>
        <p className="text-xs text-muted-foreground">CJ category: {p.categoryName ?? "—"}{optionNames.length ? ` · Options: ${optionNames.join(", ")}` : ""}</p>
      </div>
    </div>

    <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs">
      <thead className="text-muted-foreground"><tr><th className="p-2">Import</th><th className="p-2">Option</th><th className="p-2">Stock</th><th className="p-2">Item cost</th><th className="p-2">Shipping to US</th><th className="p-2">Retail price</th><th className="p-2">Net profit</th></tr></thead>
      <tbody>{p.variants.map((v) => <tr key={v.vid} className="border-t border-border">
        <td className="p-2"><input type="checkbox" aria-label={`Import ${Object.values(v.options).join(" / ") || v.sku || v.vid}`} checked={sel.has(v.vid)} onChange={() => toggle(v.vid)} /></td>
        <td className="p-2"><div className="flex items-center gap-2">{v.imageUrl && <img src={v.imageUrl} alt="" className="h-8 w-8 rounded object-cover" />}<span>{Object.entries(v.options).map(([k, x]) => `${k}: ${x}`).join(", ") || v.name || "Default"}{v.sku && <span className="block text-muted-foreground">{v.sku}</span>}</span></div></td>
        <td className="p-2">{v.stock == null ? <span className="text-destructive">Unknown</span> : v.stock === 0 ? <span className="font-bold text-destructive">Sold out</span> : v.stock}</td>
        <td className="p-2">{formatCents(v.itemCostCents)}</td>
        <td className="p-2">{v.shippingCents == null ? <span className="text-destructive">No quote</span> : <>{formatCents(v.shippingCents)} <span className={`rounded px-1 text-[10px] font-bold ${v.shippingConfirmed ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground"}`}>{v.shippingConfirmed ? "CJ QUOTE" : "ESTIMATE"}</span><span className="block text-muted-foreground">{v.shippingMethod}{v.shippingDays ? ` · ${v.shippingDays}` : ""}</span></>}</td>
        <td className="p-2 font-bold">{formatCents(v.priceCents)}</td>
        <td className="p-2"><details><summary className="cursor-pointer">{formatCents(v.breakdown.netProfitCents)} · {v.breakdown.marginPercent}%</summary><Breakdown b={v.breakdown} /></details>{v.belowFloor && <span className="block font-bold text-destructive">Below floor</span>}</td>
      </tr>)}</tbody></table></div>
    {p.truncated && <p className="text-xs text-muted-foreground">Showing the first 40 options.</p>}
    <p className="text-xs text-muted-foreground">Prices use your default pricing rule: supplier item cost + CJ shipping, plus payment fees, other costs, markup and the minimum profit floor. Sales tax is collected on top at checkout, so it isn't part of your profit. CJ QUOTE = a real CJ shipping quote for that option. ESTIMATE = borrowed from another option and only for planning. On import every selected option is quoted again by CJ; any option still without its own CJ quote is saved as not sellable until shipping is confirmed.</p>

    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={() => setPreview((x) => !x)} disabled={!chosen.length}><Eye />{preview ? "Hide shopper preview" : "Shopper preview"}</Button>
      <Button size="sm" disabled={demo || busy || !chosen.length || title.trim().length < 2} onClick={async () => { setBusy(true); try { await onImport({ pid: p.ref, vids: chosen.map((v) => v.vid), title: title.trim(), description: desc, department: dept || null }); } finally { setBusy(false); } }}>
        {busy ? <Loader2 className="animate-spin" /> : <PackagePlus />}Import {chosen.length} option{chosen.length === 1 ? "" : "s"} as draft</Button>
      {demo && <span className="self-center text-xs font-semibold text-muted-foreground">Import is disabled in demo mode.</span>}
    </div>

    {preview && <div className="rounded-xl border border-border p-4" aria-label="Shopper preview">
      <p className="mb-2 text-[11px] font-bold uppercase text-muted-foreground">What shoppers would see after approval</p>
      <p className="text-xs text-muted-foreground">Sold by PB Bazaar Direct</p>
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="text-xl font-black">from {formatCents(Math.min(...chosen.map((v) => v.priceCents)))}</p>
      <div className="mt-2 flex flex-wrap gap-1">{chosen.map((v) => <span key={v.vid} className="rounded-md border border-border px-2 py-1 text-xs">{Object.values(v.options).join(" / ") || "Default"}{(v.stock ?? 0) === 0 && " · SOLD OUT"}</span>)}</div>
      <p className="mt-2 whitespace-pre-wrap text-sm">{desc.slice(0, 600)}</p>
    </div>}
  </section>;
}

export function Breakdown({ b }: { b: { priceCents: number; itemCostCents: number; supplierShippingCents: number; ruleShippingCents: number; feeCents: number; otherCostCents: number; netProfitCents: number; marginPercent: number; minProfitCents: number; floorCents: number } }) {
  const rows: [string, number][] = [["Retail price", b.priceCents], ["− Supplier item cost", b.itemCostCents], ["− CJ shipping", b.supplierShippingCents], ["− Your shipping cost", b.ruleShippingCents], ["− Stripe/payment fees", b.feeCents], ["− Other costs", b.otherCostCents]];
  return <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-3 text-[11px]">{rows.flatMap(([k, v]) => [<dt key={k + "k"} className="text-muted-foreground">{k}</dt>, <dd key={k} className="text-right">{formatCents(v)}</dd>])}
    <dt className="font-bold">= Net profit</dt><dd className="text-right font-bold">{formatCents(b.netProfitCents)} ({b.marginPercent}%)</dd>
    <dt className="text-muted-foreground">Minimum profit</dt><dd className="text-right">{formatCents(b.minProfitCents)}</dd>
    <dt className="text-muted-foreground">Lowest allowed price</dt><dd className="text-right">{formatCents(b.floorCents)}</dd>
    <dt className="col-span-2 text-muted-foreground">Sales tax is collected on top at checkout and isn't profit.</dt></dl>;
}
