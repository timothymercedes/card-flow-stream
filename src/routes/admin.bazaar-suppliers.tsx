import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Boxes } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCents } from "@/lib/bazaar";
import { computePrice, type PricingRule } from "@/lib/bazaarPricing";

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
const TABS = [["imports", "Imports"], ["suppliers", "Suppliers"], ["pricing", "Pricing"], ["history", "Sync history"]] as const;
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
  const links = useQuery({ queryKey: ["bazaar-sup", "links"], enabled: ok, queryFn: async () => { const { data, error } = await supabase.from("bazaar_supplier_product_links").select("*, bazaar_products(id,title,status), bazaar_suppliers(name,is_demo)").order("created_at", { ascending: false }).limit(200); if (error) throw error; return data; } });
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
    if (fail((await supabase.from("bazaar_supplier_product_links").update({ supplier_cost_cents: cost, price_override_cents: override, computed_price_cents: res.priceCents, margin_cents: res.profitCents, below_floor: res.belowFloor }).eq("id", link.id)).error)) return;
    if (fail((await supabase.from("bazaar_product_variants").update({ price_cents: res.priceCents, compare_at_cents: null }).eq("id", link.variant_id)).error)) return;
    refresh();
  }
  async function recalcAll() { for (const l of links.data ?? []) await reprice(l); toast.success("Prices recalculated"); }
  async function approve(link: NonNullable<typeof links.data>[number]) {
    if (link.below_floor && !confirm("This price is below the profit floor. Approve anyway?")) return;
    if (fail((await supabase.from("bazaar_supplier_product_links").update({ review_status: "approved", reviewed_by: user!.id, reviewed_at: new Date().toISOString() }).eq("id", link.id)).error)) return;
    if (fail((await supabase.from("bazaar_products").update({ status: "published" }).eq("id", link.product_id)).error)) { await supabase.from("bazaar_supplier_product_links").update({ review_status: "pending" }).eq("id", link.id); refresh(); return; }
    toast.success("Approved and published"); refresh();
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
      await supabase.from("bazaar_supplier_product_links").insert({ supplier_id: supplierId, product_id: prod.id, variant_id: v.id, supplier_item_ref: `demo-${crypto.randomUUID().slice(0, 8)}`, supplier_cost_cents: cost, supplier_stock: 5, sync_status: "ok", last_synced_at: new Date().toISOString() });
      made++;
    }
    if (job) await supabase.from("bazaar_supplier_sync_jobs").update({ status: made ? "succeeded" : "failed", items_seen: samples.length, items_changed: made, finished_at: new Date().toISOString() }).eq("id", job.id);
    toast.success(`${made} demo items added for review`); refresh();
    setTimeout(() => void qc.fetchQuery({ queryKey: ["bazaar-sup", "links"] }).then(() => undefined), 0);
  }

  return <AppShell><div className="mx-auto w-full max-w-5xl space-y-5 px-3 py-4 sm:px-4">
    <Button asChild variant="ghost" size="sm"><Link to="/admin/bazaar"><ArrowLeft />Store review</Link></Button>
    <h1 className="flex items-center gap-2 text-2xl font-black"><Boxes className="h-6 w-6 text-primary" /> PB Bazaar suppliers</h1>
    {!user ? <p className="text-sm">Sign in as an admin.</p> : role.isLoading ? <p className="text-sm text-muted-foreground">Checking access…</p> : !ok ? <p role="alert" className="text-sm text-destructive">Admins only.</p> : <>
      <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">Supplier connections, automatic publishing, checkout and supplier ordering are off. Shoppers never see supplier names, costs or IDs.{direct.data?.status !== "active" && " PB Bazaar Direct is not open yet — approve it on the store review screen when you're ready to sell."}</p>
      <div className="flex gap-2 overflow-x-auto">{TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${tab === k ? "bg-primary text-primary-foreground ring-primary" : "ring-border text-muted-foreground"}`}>{l}</button>)}</div>

      {tab === "suppliers" && <ul className="space-y-3">{suppliers.data?.map((s) => <SupplierRow key={s.id} s={s} onSaved={refresh} onDemo={() => loadDemo(s.id)} />)}</ul>}

      {tab === "imports" && <div className="space-y-3">
        <div className="flex justify-end"><Button size="sm" variant="outline" onClick={recalcAll}>Recalculate all prices</Button></div>
        {!links.data?.length ? <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground ring-1 ring-border">No imported products yet.</p> :
        <ul className="space-y-3">{links.data.map((l) => <ImportRow key={l.id} l={l} onReprice={(p) => reprice(l, p)} onApprove={() => approve(l)} onReject={() => reject(l)} onDiscontinue={() => discontinue(l)} onDelete={() => removeProduct(l)} onStock={(q) => confirmStock(l, q)} />)}</ul>}
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

type LinkRow = { id: string; supplier_cost_cents: number; computed_price_cents: number | null; margin_cents: number | null; below_floor: boolean; price_override_cents: number | null; review_status: string; sync_status: string; supplier_stock: number | null; last_synced_at: string | null; bazaar_products: { id: string; title: string; status: string } | null; bazaar_suppliers: { name: string; is_demo: boolean } | null };
function ImportRow({ l, onReprice, onApprove, onReject, onDiscontinue, onDelete, onStock }: { l: LinkRow; onReprice: (p: { cost?: number; override?: number | null }) => void; onApprove: () => void; onReject: () => void; onDiscontinue: () => void; onDelete: () => void; onStock: (q: number) => void }) {
  const [cost, setCost] = useState((l.supplier_cost_cents / 100).toFixed(2));
  const [override, setOverride] = useState(l.price_override_cents != null ? (l.price_override_cents / 100).toFixed(2) : "");
  const [stock, setStock] = useState(String(l.supplier_stock ?? 0));
  const toCents = (v: string) => Math.round(parseFloat(v) * 100);
  return <li className="space-y-2 rounded-2xl bg-card p-4 ring-1 ring-border">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-bold">{l.bazaar_products?.title ?? "Deleted product"}</p><p className="text-xs text-muted-foreground">{l.bazaar_suppliers?.name}{l.bazaar_suppliers?.is_demo ? " (DEMO)" : ""} · review: {l.review_status} · sync: {l.sync_status} · product: {l.bazaar_products?.status}</p></div>
    <p className="text-sm">Cost {formatCents(l.supplier_cost_cents)} → price <strong>{l.computed_price_cents != null ? formatCents(l.computed_price_cents) : "not calculated"}</strong>{l.margin_cents != null && ` · profit ${formatCents(l.margin_cents)}`}{l.below_floor && <span className="ml-2 font-bold text-destructive">Below profit floor</span>}</p>
    <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
      <label>Supplier cost ($)<div className="flex gap-1"><Input value={cost} onChange={(e) => setCost(e.target.value)} /><Button size="sm" variant="outline" onClick={() => onReprice({ cost: toCents(cost) })}>Update</Button></div></label>
      <label>Price override ($, blank = automatic)<div className="flex gap-1"><Input value={override} onChange={(e) => setOverride(e.target.value)} /><Button size="sm" variant="outline" onClick={() => onReprice({ override: override.trim() ? toCents(override) : null })}>Set</Button></div></label>
      <label>Confirmed stock<div className="flex gap-1"><Input type="number" value={stock} onChange={(e) => setStock(e.target.value)} /><Button size="sm" variant="outline" onClick={() => onStock(Math.max(0, parseInt(stock) || 0))}>Confirm</Button></div></label>
    </div>
    <div className="flex flex-wrap gap-2">
      {l.review_status !== "approved" && <Button size="sm" onClick={onApprove} disabled={l.computed_price_cents == null}>Approve & publish</Button>}
      {l.review_status !== "rejected" && <Button size="sm" variant="outline" onClick={onReject}>Reject</Button>}
      {l.sync_status !== "discontinued" && <Button size="sm" variant="outline" onClick={onDiscontinue}>Mark discontinued</Button>}
      <Button size="sm" variant="destructive" onClick={onDelete}>Delete permanently</Button>
    </div>
  </li>;
}

function RuleEditor({ rule, onSaved }: { rule: Rule; onSaved: () => void }) {
  const fields = [["markup_percent", "Markup %"], ["markup_fixed_cents", "Fixed markup (¢)"], ["min_profit_cents", "Min profit (¢)"], ["min_margin_percent", "Min margin %"], ["shipping_cost_cents", "Shipping cost (¢)"], ["fee_percent", "Payment fee %"], ["fee_fixed_cents", "Payment fee fixed (¢)"], ["other_cost_cents", "Other costs (¢)"], ["round_to_cents", "Round up to (¢)"]] as const;
  const [f, setF] = useState<PricingRule>(() => Object.fromEntries(fields.map(([k]) => [k, Number(rule[k])])) as PricingRule);
  const [sample, setSample] = useState(1000);
  const preview = computePrice(sample, f);
  async function save() {
    const { error } = await supabase.from("bazaar_pricing_rules").update(f).eq("id", rule.id);
    if (error) toast.error(error.message); else { toast.success("Pricing saved — use Recalculate all prices on Imports"); onSaved(); }
  }
  return <section className="space-y-3 rounded-2xl bg-card p-4 ring-1 ring-border">
    <h2 className="font-bold">Default pricing rule</h2>
    <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">{fields.map(([k, label]) => <label key={k}>{label}<Input type="number" step="any" value={f[k]} onChange={(e) => setF({ ...f, [k]: Number(e.target.value) })} /></label>)}</div>
    <div className="rounded-xl bg-muted p-3 text-sm"><label className="text-xs">Preview supplier cost (¢)<Input type="number" value={sample} onChange={(e) => setSample(Math.max(0, Math.round(+e.target.value)))} /></label><p className="mt-2">Price {formatCents(preview.priceCents)} · profit {formatCents(preview.profitCents)} · margin {preview.marginPercent}% · floor {formatCents(preview.floorCents)}</p></div>
    <Button size="sm" onClick={save}>Save rule</Button>
  </section>;
}
