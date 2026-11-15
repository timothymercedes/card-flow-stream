import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getBazaarCatalogPage, bulkBazaarCatalogAction } from "@/lib/bazaarCatalog.functions";
import { CATALOG_PAGE_SIZE, type CatalogSort } from "@/lib/bazaarCatalog";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Boxes } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCents } from "@/lib/bazaar";
import { computePrice, type PricingRule } from "@/lib/bazaarPricing";
import { CJDiscovery, Breakdown } from "@/components/bazaar/CJDiscovery";
import { CJBulkScan } from "@/components/bazaar/CJBulkScan";
import { approvalBlocker } from "@/lib/suppliers/approval";
import { recheckCJProduct } from "@/lib/cjSupplier.functions";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/admin/bazaar-suppliers")({
  head: () => ({ meta: [
    { title: "PB Bazaar Suppliers — PullBid Live Admin" },
    { name: "description", content: "Manage PB Bazaar suppliers, imported product review, pricing rules and sync history." },
    { property: "og:title", content: "PB Bazaar Suppliers — PullBid Live Admin" },
    { property: "og:description", content: "Supplier review and pricing tools for PB Bazaar Direct." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" },
  ] }),
  component: SuppliersAdmin,
});

type Rule = PricingRule & { id: string; scope: string; supplier_id: string | null; product_id: string | null };
const TABS = [["cj", "CJ discovery"], ["imports", "Imports"], ["suppliers", "Suppliers"], ["pricing", "Pricing"], ["history", "Sync history"]] as const;
const STATUS_LABEL: Record<string, string> = { not_connected: "Not connected", application_pending: "Application pending", approved: "Approved", connected: "Connected", paused: "Paused", error: "Error", demo: "DEMO" };

function pickRule(rules: Rule[], supplierId: string, productId: string): Rule | undefined {
  return rules.find((r) => r.scope === "product" && r.product_id === productId) ?? rules.find((r) => r.scope === "supplier" && r.supplier_id === supplierId) ?? rules.find((r) => r.scope === "default");
}

function SuppliersAdmin() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("imports");
  const role = useQuery({ queryKey: ["bazaar", "is-admin", user?.id], enabled: !!user, queryFn: async () => !!(await supabase.rpc("is_bazaar_admin", { _uid: user!.id })).data });
  const ok = !!role.data;
  const suppliers = useQuery({ queryKey: ["bazaar-sup", "suppliers"], enabled: ok, queryFn: async () => { const { data, error } = await supabase.from("bazaar_suppliers").select("*").order("name"); if (error) throw error; return data; } });
  const rules = useQuery({ queryKey: ["bazaar-sup", "rules"], enabled: ok, queryFn: async () => { const { data, error } = await supabase.from("bazaar_pricing_rules").select("*"); if (error) throw error; return data as unknown as Rule[]; } });
  const recheckFn = useServerFn(recheckCJProduct);
  async function recheck(productId: string) { const r = await recheckFn({ data: { productId } }); if (r.error) toast.error(r.error); else toast.success(`Checked ${r.checked} options with CJ: ${r.changed} price/shipping change${r.changed === 1 ? "" : "s"}${r.missing ? `, ${r.missing} no longer offered` : ""}.${r.changed || r.missing ? " Review needed before selling." : ""}`); refresh(); }
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [catalogStatus, setCatalogStatus] = useState<"all" | "draft" | "published" | "paused" | "private_test">("all");
  const [sort, setSort] = useState<CatalogSort>("newest");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const catalogFn = useServerFn(getBazaarCatalogPage), bulkFn = useServerFn(bulkBazaarCatalogAction);
  const catalog = useQuery({ queryKey: ["bazaar-sup", "catalog", page, search, category, catalogStatus, sort], enabled: ok && tab === "imports", queryFn: () => catalogFn({ data: { page, search, category, status: catalogStatus, sort } }) });
  const links = { data: catalog.data?.products.flatMap((p) => p.bazaar_supplier_product_links.map((l) => ({ ...l, bazaar_products: { id: p.id, title: p.title, status: p.status } }))) };
  function resetPage() { setPage(1); setSelected([]); }
  async function bulk(action: "draft" | "pause" | "reject") {
    setBusy(true);
    try { const r = await bulkFn({ data: { ids: selected, action } }); toast.success(`${r.changed} products updated; nothing published.`); setSelected([]); refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Action failed."); }
    finally { setBusy(false); }
  }
  const direct = useQuery({ queryKey: ["bazaar-sup", "direct"], enabled: ok, queryFn: async () => (await supabase.from("bazaar_stores").select("id,status").eq("slug", "pb-bazaar-direct").maybeSingle()).data });
  const history = useQuery({ queryKey: ["bazaar-sup", "history"], enabled: ok && tab === "history", queryFn: async () => {
    const [jobs, events] = await Promise.all([
      supabase.from("bazaar_supplier_sync_jobs").select("*, bazaar_suppliers(name)").order("started_at", { ascending: false }).limit(50),
      supabase.from("bazaar_supplier_events").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    return { jobs: jobs.data ?? [], events: events.data ?? [] };
  } });
  const refresh = () => qc.invalidateQueries({ queryKey: ["bazaar-sup"] });
  const fail = (e: { message: string } | null) => { if (e) { toast.error(e.message); return true; } return false; };

  async function reprice(link: NonNullable<typeof links.data>[number], patch: { cost?: number; override?: number | null } = {}) {
    const rule = pickRule(rules.data ?? [], link.supplier_id, link.product_id);
    if (!rule) return toast.error("Set a default pricing rule first.");
    const cost = patch.cost ?? link.supplier_cost_cents;
    const override = patch.override !== undefined ? patch.override : link.price_override_cents;
    const res = computePrice(cost, rule, override);
    if (fail((await supabase.from("bazaar_supplier_product_links").update({ supplier_cost_cents: cost, price_override_cents: override, computed_price_cents: res.priceCents, margin_cents: res.profitCents, below_floor: res.belowFloor, ...(cost !== link.supplier_cost_cents && link.review_status === "approved" ? { review_status: "pending" } : {}) }).eq("id", link.id)).error)) return;
    if (fail((await supabase.from("bazaar_product_variants").update({ price_cents: res.priceCents, compare_at_cents: null }).eq("id", link.variant_id)).error)) return;
    refresh();
  }
  async function recalcAll() { for (const l of links.data ?? []) await reprice(l); toast.success("Prices recalculated"); }
  async function approve(link: NonNullable<typeof links.data>[number]) {
    const siblings = (links.data ?? []).filter((x) => x.product_id === link.product_id);
    if (siblings.some((x) => x.computed_price_cents == null)) return toast.error("Calculate a price for every option of this product first.");
    const block = approvalBlocker(siblings);
    if (block) return toast.error(block);
    if (fail((await supabase.from("bazaar_supplier_product_links").update({ review_status: "approved", reviewed_by: user!.id, reviewed_at: new Date().toISOString() }).eq("product_id", link.product_id).neq("review_status", "rejected")).error)) return;
    toast.success("Reviewed — product remains hidden. Publication requires separate launch approval."); refresh();
  }
  async function reject(link: NonNullable<typeof links.data>[number]) {
    if (fail((await supabase.from("bazaar_supplier_product_links").update({ review_status: "rejected", reviewed_by: user!.id, reviewed_at: new Date().toISOString() }).eq("id", link.id)).error)) return;
    await supabase.from("bazaar_products").update({ status: "paused" }).eq("id", link.product_id).eq("status", "published");
    refresh();
  }
  async function discontinue(link: NonNullable<typeof links.data>[number]) {
    if (!fail((await supabase.from("bazaar_supplier_product_links").update({ sync_status: "discontinued" }).eq("id", link.id)).error)) { toast.success("Marked unavailable"); refresh(); }
  }
  async function removeProduct(link: NonNullable<typeof links.data>[number]) {
    if (!confirm(`Permanently delete "${link.bazaar_products?.title}"? This cannot be undone.`)) return;
    if (!fail((await supabase.from("bazaar_products").delete().eq("id", link.product_id)).error)) { toast.success("Deleted"); refresh(); }
  }
  async function confirmStock(link: NonNullable<typeof links.data>[number], qty: number) {
    if (fail((await supabase.from("bazaar_supplier_product_links").update({ supplier_stock: qty, sync_status: link.sync_status === "discontinued" ? "discontinued" : "ok", last_synced_at: new Date().toISOString() }).eq("id", link.id)).error)) return;
    if (!fail((await supabase.from("bazaar_product_variants").update({ quantity: qty }).eq("id", link.variant_id)).error)) { toast.success("Stock confirmed"); refresh(); }
  }
  async function loadDemo(supplierId: string) {
    if (!direct.data) return toast.error("PB Bazaar Direct store is missing.");
    const { data: job } = await supabase.from("bazaar_supplier_sync_jobs").insert({ supplier_id: supplierId, kind: "demo_load", started_by: user!.id }).select("id").single();
    const samples = [["Wireless Earbuds", 1450], ["LED Desk Lamp", 980]] as const;
    let made = 0;
    for (const [title, cost] of samples) {
      const { data: prod, error } = await supabase.from("bazaar_products").insert({ store_id: direct.data.id, title: `[DEMO] ${title}`, description: "Labeled demo item. Never published.", status: "draft" }).select("id").single();
      if (fail(error) || !prod) break;
      const { data: v } = await supabase.from("bazaar_product_variants").insert({ product_id: prod.id, price_cents: cost * 2, quantity: 5 }).select("id").single();
      if (!v) break;
      await supabase.from("bazaar_supplier_product_links").insert({ supplier_id: supplierId, product_id: prod.id, variant_id: v.id, supplier_item_ref: `demo-${crypto.randomUUID().slice(0, 8)}`, supplier_cost_cents: cost, supplier_stock: 5, sync_status: "ok", last_synced_at: new Date().toISOString(), ...(() => { const r = (rules.data ?? []).find((x) => x.scope === "default"); if (!r) return {}; const res = computePrice(cost, r); return { computed_price_cents: res.priceCents, margin_cents: res.profitCents, below_floor: res.belowFloor }; })() });
      made++;
    }
    if (job) await supabase.from("bazaar_supplier_sync_jobs").update({ status: made ? "succeeded" : "failed", items_seen: samples.length, items_changed: made, finished_at: new Date().toISOString() }).eq("id", job.id);
    toast.success(`${made} demo items added for review`); refresh();
  }

  return <AppShell><div className="mx-auto w-full max-w-5xl space-y-5 px-3 py-4 sm:px-4">
    <Button asChild variant="ghost" size="sm"><Link to="/admin/bazaar"><ArrowLeft />Store review</Link></Button>
    <h1 className="flex items-center gap-2 text-2xl font-black"><Boxes className="h-6 w-6 text-primary" /> PB Bazaar suppliers</h1>
    {!user ? <p className="text-sm">Sign in as an admin.</p> : role.isLoading ? <p className="text-sm text-muted-foreground">Checking access…</p> : !ok ? <p role="alert" className="text-sm text-destructive">Admins only.</p> : <>
      <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">Automatic publishing, checkout and supplier ordering are off. Shoppers never see supplier names, costs or IDs.{direct.data?.status !== "active" && " PB Bazaar Direct is not open yet — approve it on the store review screen when you're ready to sell."}</p>
      <div className="flex gap-2 overflow-x-auto">{TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${tab === k ? "bg-primary text-primary-foreground ring-primary" : "ring-border text-muted-foreground"}`}>{l}</button>)}</div>

      {tab === "cj" && <><CJBulkScan /><CJDiscovery /></>}

      {tab === "suppliers" && <ul className="space-y-3">{suppliers.data?.map((s) => <SupplierRow key={s.id} s={s} onSaved={refresh} onDemo={() => loadDemo(s.id)} />)}</ul>}

      {tab === "imports" && <div className="space-y-3">
        <div className="flex justify-end"><Button size="sm" variant="outline" onClick={recalcAll}>Recalculate this page</Button></div>
        <div className="grid gap-2 sm:grid-cols-4">
          <Input aria-label="Search imported products" placeholder="Search products" value={search} onChange={(e) => { setSearch(e.target.value); resetPage(); }} />
          <Select value={category} onValueChange={(v) => { setCategory(v); resetPage(); }}><SelectTrigger aria-label="Category filter"><SelectValue /></SelectTrigger><SelectContent>{["all", "Fashion", "Footwear", "Electronics", "Beauty", "Tools", "Home", "Automotive", "Sports & Outdoors", "Toys & Hobbies"].map((v) => <SelectItem key={v} value={v}>{v === "all" ? "All categories" : v}</SelectItem>)}</SelectContent></Select>
          <Select value={catalogStatus} onValueChange={(v) => { setCatalogStatus(v as typeof catalogStatus); resetPage(); }}><SelectTrigger aria-label="Product status"><SelectValue /></SelectTrigger><SelectContent>{["all", "draft", "published", "paused", "private_test"].map((v) => <SelectItem key={v} value={v}>{v === "all" ? "All statuses" : v}</SelectItem>)}</SelectContent></Select>
          <Select value={sort} onValueChange={(v) => { setSort(v as CatalogSort); resetPage(); }}><SelectTrigger aria-label="Sort products"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="newest">Newest first</SelectItem><SelectItem value="oldest">Oldest first</SelectItem><SelectItem value="title">Title A–Z</SelectItem></SelectContent></Select>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm"><span>{catalog.data?.total ?? "—"} products · {selected.length} selected</span><Button size="sm" variant="outline" disabled={!selected.length || busy} onClick={() => void bulk("draft")}>Keep as drafts</Button><Button size="sm" variant="outline" disabled={!selected.length || busy} onClick={() => void bulk("pause")}>Pause selected</Button><Button size="sm" variant="outline" disabled={!selected.length || busy} onClick={() => void bulk("reject")}>Reject selected</Button></div>
        {catalog.isPending ? <p>Loading catalog…</p> : catalog.isError ? <p role="alert" className="text-destructive">{catalog.error.message}</p> : !catalog.data?.products.length ? <p className="text-muted-foreground">No matching products.</p> :
        <div className="space-y-5">{catalog.data.products.map((p) => <section key={p.id} className="space-y-2 border-b border-border pb-4">
          <div className="flex items-center gap-3"><Checkbox aria-label={`Select ${p.title}`} disabled={!["draft", "paused"].includes(p.status)} checked={selected.includes(p.id)} onCheckedChange={(v) => setSelected((old) => v ? [...old, p.id] : old.filter((id) => id !== p.id))} />{p.images[0] && <img src={p.images[0]} alt="" loading="lazy" className="h-14 w-14 rounded-md object-cover" />}<div className="min-w-0"><h2 className="break-words font-bold">{p.title}</h2><p className="text-xs text-muted-foreground">{p.department ?? "Uncategorized"} · <strong>{p.status}</strong> · {p.bazaar_supplier_product_links.length} variants · {p.images.length} images</p><ProductSummary p={p} /></div><Link to="/admin/bazaar-preview/$id" params={{ id: p.id }} className="ml-auto shrink-0 text-sm font-semibold text-primary">Preview</Link></div>
          <details><summary className="cursor-pointer text-sm font-semibold">Variants and review</summary><ul className="mt-2 space-y-3">{(links.data ?? []).filter((l) => l.product_id === p.id).map((l) => <ImportRow key={l.id} l={l} onReprice={(patch) => reprice(l, patch)} onApprove={() => approve(l)} onReject={() => reject(l)} onDiscontinue={() => discontinue(l)} onDelete={() => removeProduct(l)} onStock={(q) => confirmStock(l, q)} onRecheck={() => recheck(l.product_id)} />)}</ul></details>
        </section>)}</div>}
        <div className="flex items-center justify-between gap-3"><Button variant="outline" disabled={page === 1 || catalog.isFetching} onClick={() => { setPage(page - 1); setSelected([]); }}>Previous</Button><span className="text-sm">Page {page} of {Math.max(1, Math.ceil((catalog.data?.total ?? 0) / CATALOG_PAGE_SIZE))}</span><Button variant="outline" disabled={page * CATALOG_PAGE_SIZE >= (catalog.data?.total ?? 0) || catalog.isFetching} onClick={() => { setPage(page + 1); setSelected([]); }}>Next</Button></div>
      </div>}

      {tab === "pricing" && <div className="space-y-3">{(rules.data ?? []).filter((r) => r.scope === "default").map((r) => <RuleEditor key={r.id} rule={r} onSaved={refresh} />)}</div>}

      {tab === "history" && <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl bg-card p-4 ring-1 ring-border"><h2 className="font-bold">Sync jobs</h2>{!history.data?.jobs.length ? <p className="text-sm text-muted-foreground">None yet.</p> : <ul className="mt-2 space-y-1 text-xs">{history.data.jobs.map((j) => <li key={j.id}>{new Date(j.started_at).toLocaleString()} · {(j.bazaar_suppliers as { name: string } | null)?.name} · {j.kind} · {j.status} · {j.items_changed}/{j.items_seen}</li>)}</ul>}</section>
        <section className="rounded-2xl bg-card p-4 ring-1 ring-border"><h2 className="font-bold">Changes</h2>{!history.data?.events.length ? <p className="text-sm text-muted-foreground">None yet.</p> : <ul className="mt-2 space-y-1 text-xs">{history.data.events.map((e) => <li key={e.id}>{new Date(e.created_at).toLocaleString()} · {e.event_type} · {JSON.stringify(e.details)}</li>)}</ul>}</section>
      </div>}
    </>}
  </div></AppShell>;
}

function SupplierRow({ s, onSaved, onDemo }: { s: { id: string; name: string; status: string; is_demo: boolean; delivery_min_days: number; delivery_max_days: number; stale_after_hours: number }; onSaved: () => void; onDemo: () => void }) {
  const [f, setF] = useState({ min: s.delivery_min_days, max: s.delivery_max_days, stale: s.stale_after_hours });
  async function save() {
    const { error } = await supabase.from("bazaar_suppliers").update({ delivery_min_days: f.min, delivery_max_days: f.max, stale_after_hours: f.stale }).eq("id", s.id);
    if (error) toast.error(error.message); else { toast.success("Saved"); onSaved(); }
  }
  return <li className="space-y-2 rounded-2xl bg-card p-4 ring-1 ring-border">
    <div className="flex flex-wrap items-center gap-2"><p className="font-bold">{s.name}</p><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${s.is_demo ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"}`}>{STATUS_LABEL[s.status] ?? s.status}</span></div>
    <div className="grid grid-cols-3 gap-2 text-xs"><label>Delivery min days<Input type="number" value={f.min} onChange={(e) => setF({ ...f, min: +e.target.value })} /></label><label>Delivery max days<Input type="number" value={f.max} onChange={(e) => setF({ ...f, max: +e.target.value })} /></label><label>Stale after (hours)<Input type="number" value={f.stale} onChange={(e) => setF({ ...f, stale: +e.target.value })} /></label></div>
    <div className="flex flex-wrap gap-2"><Button size="sm" onClick={save}>Save</Button>{s.is_demo && <Button size="sm" variant="outline" onClick={onDemo}>Load labeled demo items</Button>}</div>
    {!s.is_demo && s.status !== "connected" && <p className="text-xs text-muted-foreground">Connection is off until official access is approved.</p>}
  </li>;
}

type LinkRow = { id: string; supplier_cost_cents: number; computed_price_cents: number | null; margin_cents: number | null; below_floor: boolean; price_override_cents: number | null; review_status: string; sync_status: string; supplier_stock: number | null; last_synced_at: string | null; bazaar_products: { id: string; title: string; status: string } | null; bazaar_suppliers: { name: string; is_demo: boolean } | null; bazaar_supplier_events?: { event_type: string; details: unknown; created_at: string }[] };
function ImportRow({ l, onReprice, onApprove, onReject, onDiscontinue, onDelete, onStock, onRecheck }: { l: LinkRow; onRecheck: () => void; onReprice: (p: { cost?: number; override?: number | null }) => void; onApprove: () => void; onReject: () => void; onDiscontinue: () => void; onDelete: () => void; onStock: (q: number) => void }) {
  const [cost, setCost] = useState((l.supplier_cost_cents / 100).toFixed(2));
  const [override, setOverride] = useState(l.price_override_cents != null ? (l.price_override_cents / 100).toFixed(2) : "");
  const [stock, setStock] = useState(String(l.supplier_stock ?? 0));
  const toCents = (v: string) => Math.round(parseFloat(v) * 100);
  return <li className="space-y-2 rounded-2xl bg-card p-4 ring-1 ring-border">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-bold">{l.bazaar_products?.title ?? "Deleted product"}</p><p className="text-xs text-muted-foreground">{l.bazaar_suppliers?.name}{l.bazaar_suppliers?.is_demo ? " (DEMO)" : ""} · review: {l.review_status} · sync: {l.sync_status} · product: {l.bazaar_products?.status}{l.bazaar_products?.status === "private_test" && <> · <Link to="/admin/bazaar-preview/$id" params={{ id: l.bazaar_products.id }} className="font-semibold text-primary">Test preview</Link></>}</p></div>
    <p className="text-sm">Cost {formatCents(l.supplier_cost_cents)} → price <strong>{l.computed_price_cents != null ? formatCents(l.computed_price_cents) : "not calculated"}</strong>{l.margin_cents != null && ` · profit ${formatCents(l.margin_cents)}`}{l.below_floor && <span className="ml-2 font-bold text-destructive">Below profit floor</span>}</p>
    {(() => { const ev = l.bazaar_supplier_events?.find((e) => e.event_type === "imported"); const d = ev?.details as { breakdown?: Parameters<typeof Breakdown>[0]["b"]; shipping_confirmed?: boolean; shipping_method?: string; shipping_days?: string; ships_from?: string; stock?: number } | undefined;
      return d?.breakdown ? <><p className="text-xs text-muted-foreground">Warehouse origin: {d.ships_from ?? "Not recorded"} · Estimated delivery: {d.shipping_days ?? "Not supplied by CJ"}</p><details className="rounded-xl bg-muted p-2 text-xs"><summary className="cursor-pointer font-semibold">Profit breakdown at import · net {formatCents(d.breakdown.netProfitCents)} ({d.breakdown.marginPercent}%) · shipping {d.shipping_confirmed ? "CJ quote" : "NOT confirmed"}{d.shipping_method ? ` (${d.shipping_method}${d.shipping_days ? `, ${d.shipping_days}` : ""})` : ""}</summary><Breakdown b={d.breakdown} /></details></> : null; })()}
    <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
      <label>Supplier cost ($)<div className="flex gap-1"><Input value={cost} onChange={(e) => setCost(e.target.value)} /><Button size="sm" variant="outline" onClick={() => onReprice({ cost: toCents(cost) })}>Update</Button></div></label>
      <label>Price override ($, blank = automatic)<div className="flex gap-1"><Input value={override} onChange={(e) => setOverride(e.target.value)} /><Button size="sm" variant="outline" onClick={() => onReprice({ override: override.trim() ? toCents(override) : null })}>Set</Button></div></label>
      <label>Confirmed stock<div className="flex gap-1"><Input type="number" value={stock} onChange={(e) => setStock(e.target.value)} /><Button size="sm" variant="outline" onClick={() => onStock(Math.max(0, parseInt(stock) || 0))}>Confirm</Button></div></label>
    </div>
    <div className="flex flex-wrap gap-2">
      {l.computed_price_cents == null && <Button size="sm" variant="outline" onClick={() => onReprice({})}>Calculate price</Button>}
      {l.bazaar_suppliers?.is_demo ? <span className="self-center text-xs font-semibold text-muted-foreground">Demo item — can't be published</span> : l.review_status !== "approved" && <Button size="sm" onClick={onApprove} disabled={l.computed_price_cents == null}>Approve review (keep hidden)</Button>}
      {l.review_status !== "rejected" && <Button size="sm" variant="outline" onClick={onReject}>Reject</Button>}
      {l.sync_status !== "discontinued" && <Button size="sm" variant="outline" onClick={onDiscontinue}>Mark discontinued</Button>}
      <Button size="sm" variant="outline" onClick={onRecheck}>Recheck with CJ</Button>
      <Button size="sm" variant="destructive" onClick={onDelete}>Delete permanently</Button>
    </div>
  </li>;
}

function RuleEditor({ rule, onSaved }: { rule: Rule; onSaved: () => void }) {
  const fields = [["markup_percent", "Markup %"], ["markup_fixed_cents", "Fixed markup ($)"], ["min_profit_cents", "Minimum profit ($)"], ["min_margin_percent", "Minimum margin %"], ["shipping_cost_cents", "Your shipping cost ($)"], ["fee_percent", "Payment fee %"], ["fee_fixed_cents", "Payment fee per order ($)"], ["other_cost_cents", "Other costs per item ($)"], ["round_to_cents", "Round price up to nearest ($)"]] as const;
  const isMoney = (k: string) => k.endsWith("_cents");
  const [f, setF] = useState<PricingRule>(() => Object.fromEntries(fields.map(([k]) => [k, Number(rule[k])])) as PricingRule);
  const [sample, setSample] = useState(1000);
  const preview = computePrice(sample, f);
  async function save() {
    const { error } = await supabase.from("bazaar_pricing_rules").update(f).eq("id", rule.id);
    if (error) toast.error(error.message); else { toast.success("Pricing saved — use Recalculate all prices on Imports"); onSaved(); }
  }
  return <section className="space-y-3 rounded-2xl bg-card p-4 ring-1 ring-border">
    <h2 className="font-bold">Default pricing rule</h2>
    <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">{fields.map(([k, label]) => <label key={k}>{label}<Input type="number" step="any" value={isMoney(k) ? f[k] / 100 : f[k]} onChange={(e) => setF({ ...f, [k]: isMoney(k) ? Math.round(Number(e.target.value) * 100) : Number(e.target.value) })} /></label>)}</div>
    <div className="rounded-xl bg-muted p-3 text-sm"><label className="text-xs">Try a supplier cost ($)<Input type="number" step="0.01" value={sample / 100} onChange={(e) => setSample(Math.max(0, Math.round(+e.target.value * 100)))} /></label><p className="mt-2">Price {formatCents(preview.priceCents)} · profit {formatCents(preview.profitCents)} · margin {preview.marginPercent}% · lowest allowed price {formatCents(preview.floorCents)}</p><p className="mt-1 text-xs text-muted-foreground">Profit is after supplier cost, your shipping cost, payment fees and other costs.</p></div>
    <Button size="sm" onClick={save}>Save rule</Button>
  </section>;
}

type SummaryProduct = { bazaar_product_variants?: { price_cents: number; quantity: number; is_active: boolean }[]; bazaar_supplier_product_links: { review_status: string; sync_status: string; is_active?: boolean; bazaar_supplier_events?: { event_type: string; details: unknown }[] }[] };
function ProductSummary({ p }: { p: SummaryProduct }) {
  const vs = p.bazaar_product_variants ?? [];
  const prices = vs.map((v) => v.price_cents).filter((n) => n > 0);
  const live = vs.filter((v) => v.is_active);
  const stock = live.reduce((n, v) => n + v.quantity, 0);
  const approved = p.bazaar_supplier_product_links.filter((l) => l.review_status === "approved" && l.sync_status === "ok").length;
  const d = p.bazaar_supplier_product_links.flatMap((l) => l.bazaar_supplier_events ?? []).find((e) => e.event_type === "imported")?.details as { shipping_days?: string; ships_from?: string } | undefined;
  return <p className="text-xs text-muted-foreground">{prices.length ? `${formatCents(Math.min(...prices))}${Math.max(...prices) !== Math.min(...prices) ? `–${formatCents(Math.max(...prices))}` : ""}` : "No price"} · {live.length ? `${stock} in stock (${live.length} active)` : "No active options"} · {approved}/{p.bazaar_supplier_product_links.length} options verified · Delivery {d?.shipping_days ?? "not recorded"}{d?.ships_from ? ` from ${d.ships_from}` : ""}</p>;
}
