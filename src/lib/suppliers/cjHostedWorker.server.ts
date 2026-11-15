/**
 * Hosted CJ catalog worker (runs from the scheduled server endpoint, no browser needed).
 * Fast stage: search + detail + one bulk inventory call per product; imports hidden DRAFTS whose
 * options stay "unverified" (inactive, review pending) until the existing per-product CJ recheck
 * confirms live US shipping and the $2 profit floor. Stage 2 (qualifyOne) re-checks live stock, a confirmed
 * US shipping quote and the profit floor, activates only passing options and publishes the product when at
 * least one passes. Never orders, pays or refunds; publication stays invisible until the store is active.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { PricingRule } from "@/lib/bazaarPricing";
import type { CJDropshippingAdapter } from "./cjAdapter.server";
import { htmlToText, CJ_SUPPLIER_NAME } from "./cjImport";
import { cheapestQuote, landedPrice } from "./cjImport";
import { productDecision, qualifyVariant, REQUALIFY_AFTER_HOURS } from "./cjQualify";
import { advance, departmentFor, emptyState, outcomeFor, pickOptions, priceOption, BULK_PAGE_SIZE, LEASE_SECONDS, type BulkState, type RejectReason } from "./cjBulk";

type Db = SupabaseClient<Database>;
type Cat = { id: string; name: string; parent: string; top: string; topId: string };
type Ctx = { db: Db; cj: CJDropshippingAdapter; supplierId: string; storeId: string; rule: PricingRule; estShip: Record<string, number> };

/** Shipping estimate (median of real CJ quotes already recorded) used only to pre-screen; never marks an option verified. */
async function shippingEstimates(db: Db, supplierId: string): Promise<Record<string, number>> {
  const { data } = await db.from("bazaar_supplier_events").select("details").eq("supplier_id", supplierId).eq("event_type", "imported").order("created_at", { ascending: false }).limit(400);
  const by: Record<string, number[]> = {};
  for (const e of data ?? []) { const d = e.details as { ships_from?: string; shipping_cents?: number } | null; if (d?.ships_from && typeof d.shipping_cents === "number") (by[d.ships_from] ??= []).push(d.shipping_cents); }
  const med = (a: number[] | undefined, f: number) => { if (!a?.length) return f; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  return { US: med(by.US, 0), CN: med(by.CN, 600) };
}

async function record(ctx: Ctx, ref: string, cat: Cat, r: RejectReason | "imported", productId: string | null) {
  const outcome = outcomeFor(r);
  const { data: prev } = await ctx.db.from("bazaar_scan_outcomes").select("attempts,outcome").eq("supplier_id", ctx.supplierId).eq("supplier_item_ref", ref).maybeSingle();
  if (prev?.outcome === "imported") return; // never downgrade an import
  await ctx.db.from("bazaar_scan_outcomes").upsert({ supplier_id: ctx.supplierId, supplier_item_ref: ref, category_top: cat.top, category_id: cat.id, outcome, reason: r === "imported" ? null : r, product_id: productId, attempts: (prev?.attempts ?? 0) + 1, updated_at: new Date().toISOString() });
}

async function importFast(ctx: Ctx, item: { ref: string; imageUrl: string | null }, cat: Cat): Promise<{ r: RejectReason | "imported"; productId: string | null }> {
  const { db, cj } = ctx;
  // Cache: anything already decided (other than a retryable failure) costs zero CJ calls.
  const { data: seen } = await db.from("bazaar_scan_outcomes").select("outcome,reason,product_id").eq("supplier_id", ctx.supplierId).eq("supplier_item_ref", item.ref).maybeSingle();
  if (seen && seen.outcome !== "failed") return { r: "duplicate", productId: seen.product_id };
  if (!item.imageUrl) return { r: "no_image", productId: null };
  const dup = await db.from("bazaar_supplier_product_links").select("product_id").eq("supplier_id", ctx.supplierId).eq("supplier_item_ref", item.ref).limit(1);
  if (dup.data?.length) return { r: "duplicate", productId: dup.data[0].product_id };
  const d = await cj.getProductDetail(item.ref);
  if (!d.images.length) return { r: "no_image", productId: null };
  if (!d.variants.length) return { r: "no_options", productId: null };
  const inv = new Map((await cj.getInventoryByPid(d.ref)).map((v) => [v.vid, v.byCountry]));
  const picked = pickOptions(d.variants.map((v) => { const c = inv.get(v.vid) ?? {}; return { vid: v.vid, costCents: v.costCents, stockUS: c.US ?? 0, stockOther: c.CN ?? 0 }; }));
  if (!picked.length) return { r: "out_of_stock", productId: null };
  const priced = picked.map((o) => ({ o, ship: ctx.estShip[o.from] ?? ctx.estShip.CN, v: d.variants.find((x) => x.vid === o.vid)! })).map((x) => ({ ...x, p: priceOption(x.o.costCents, x.ship, ctx.rule) }));
  const ok = priced.filter((x) => !x.p.belowFloor);
  if (!ok.length) return { r: "below_floor", productId: null };
  const skuDup = await db.from("bazaar_supplier_product_links").select("product_id").eq("supplier_id", ctx.supplierId).in("supplier_sku", ok.map((x) => x.o.vid)).limit(1);
  if (skuDup.data?.length) return { r: "duplicate", productId: skuDup.data[0].product_id };

  const prod = await db.from("bazaar_products").insert({ store_id: ctx.storeId, title: (d.title || "Untitled").slice(0, 160), description: htmlToText(d.description) || null, department: departmentFor(cat.top), images: [...new Set([...d.images, ...d.variants.flatMap((v) => v.imageUrl ? [v.imageUrl] : [])])], status: "draft", condition: "new" }).select("id").single();
  if (prod.error) throw new Error(prod.error.message);
  try {
    // Batched writes: one insert each for options, supplier links and audit events.
    const vr = await db.from("bazaar_product_variants").insert(ok.map(({ o, p, v }) => ({ product_id: prod.data.id, options: v.options, price_cents: p.priceCents, quantity: o.stock, is_active: false }))).select("id");
    if (vr.error || vr.data.length !== ok.length) throw new Error(vr.error?.message ?? "variant insert mismatch");
    const lr = await db.from("bazaar_supplier_product_links").insert(ok.map(({ o, ship, p }, i) => ({ supplier_id: ctx.supplierId, product_id: prod.data.id, variant_id: vr.data[i].id, supplier_item_ref: d.ref, supplier_sku: o.vid, supplier_cost_cents: o.costCents + ship, supplier_stock: o.stock, currency: "USD", computed_price_cents: p.priceCents, margin_cents: p.profitCents, below_floor: false, review_status: "pending", sync_status: "unverified", last_synced_at: null }))).select("id,supplier_sku");
    if (lr.error) throw new Error(lr.error.message);
    const linkBySku = new Map(lr.data.map((l) => [l.supplier_sku, l.id]));
    await db.from("bazaar_supplier_events").insert(ok.map(({ o, ship, p, v }) => ({ supplier_id: ctx.supplierId, link_id: linkBySku.get(o.vid) ?? null, event_type: "imported", details: { bulk: true, hosted: true, cj_category: cat.top, cj_category_id: cat.id, variant_image: v.imageUrl ?? null, variant_name: v.name, ships_from: o.from, item_cost_cents: o.costCents, shipping_cents: ship, shipping_confirmed: false, shipping_days: null, stock: o.stock, price_cents: p.priceCents, breakdown: p.breakdown } as never })));
  } catch (e) { await db.from("bazaar_products").delete().eq("id", prod.data.id); throw e; }
  await db.from("bazaar_backfill_queue").upsert({ product_id: prod.data.id, supplier_id: ctx.supplierId, status: "done", filled: { new_import: true } });
  return { r: "imported", productId: prod.data.id };
}

/** Fills only missing data on existing CJ drafts; never touches approved options, reviewed or admin-edited fields. */
async function backfillOne(ctx: Ctx, productId: string): Promise<void> {
  const { db, cj } = ctx;
  const q = await db.from("bazaar_backfill_queue").select("attempts").eq("product_id", productId).single();
  const attempts = (q.data?.attempts ?? 0) + 1;
  const done = (status: "done" | "skipped" | "failed", filled: Record<string, unknown>, err: string | null = null) => db.from("bazaar_backfill_queue").update({ status, filled: filled as never, last_error: err, attempts, updated_at: new Date().toISOString() }).eq("product_id", productId);
  try {
    const { data: p } = await db.from("bazaar_products").select("id,status,description,images,created_at,updated_at").eq("id", productId).single();
    if (!p || p.status !== "draft") { await done("skipped", { reason: "not a draft" }); return; }
    const { data: links } = await db.from("bazaar_supplier_product_links").select("supplier_item_ref,supplier_sku,review_status").eq("product_id", productId).eq("supplier_id", ctx.supplierId);
    const ref = links?.[0]?.supplier_item_ref;
    if (!ref) { await done("skipped", { reason: "no CJ link" }); return; }
    const adminEdited = new Date(p.updated_at).getTime() - new Date(p.created_at).getTime() > 10 * 60_000;
    const d = await cj.getProductDetail(ref);
    const filled: Record<string, unknown> = {};
    const patch: { description?: string; images?: string[] } = {};
    if (!p.description?.trim()) { const t = htmlToText(d.description); if (t) { patch.description = t; filled.description = true; } }
    if (!adminEdited) {
      const merged = [...new Set([...(p.images ?? []), ...d.images, ...d.variants.flatMap((v) => v.imageUrl ? [v.imageUrl] : [])])];
      if (merged.length > (p.images?.length ?? 0)) { patch.images = merged; filled.images_added = merged.length - (p.images?.length ?? 0); }
    }
    if (Object.keys(patch).length) { const u = await db.from("bazaar_products").update(patch).eq("id", productId).eq("status", "draft"); if (u.error) throw new Error(u.error.message); }
    const have = new Set((links ?? []).map((l) => l.supplier_sku));
    const missing = d.variants.filter((v) => !have.has(v.vid));
    if (missing.length && !adminEdited) {
      const inv = new Map((await cj.getInventoryByPid(d.ref)).map((v) => [v.vid, v.byCountry]));
      const picked = pickOptions(missing.map((v) => { const c = inv.get(v.vid) ?? {}; return { vid: v.vid, costCents: v.costCents, stockUS: c.US ?? 0, stockOther: c.CN ?? 0 }; }));
      let added = 0;
      for (const o of picked) {
        const v = missing.find((x) => x.vid === o.vid)!; const ship = ctx.estShip[o.from] ?? ctx.estShip.CN; const pr = priceOption(o.costCents, ship, ctx.rule);
        if (pr.belowFloor) continue;
        const exists = await db.from("bazaar_supplier_product_links").select("id").eq("supplier_id", ctx.supplierId).eq("supplier_sku", o.vid).limit(1);
        if (exists.data?.length) continue;
        const vr = await db.from("bazaar_product_variants").insert({ product_id: productId, options: v.options, price_cents: pr.priceCents, quantity: o.stock, is_active: false }).select("id").single();
        if (vr.error) throw new Error(vr.error.message);
        const lr = await db.from("bazaar_supplier_product_links").insert({ supplier_id: ctx.supplierId, product_id: productId, variant_id: vr.data.id, supplier_item_ref: d.ref, supplier_sku: o.vid, supplier_cost_cents: o.costCents + ship, supplier_stock: o.stock, currency: "USD", computed_price_cents: pr.priceCents, margin_cents: pr.profitCents, below_floor: false, review_status: "pending", sync_status: "unverified" }).select("id").single();
        if (lr.error) { await db.from("bazaar_product_variants").delete().eq("id", vr.data.id); throw new Error(lr.error.message); }
        await db.from("bazaar_supplier_events").insert({ supplier_id: ctx.supplierId, link_id: lr.data.id, event_type: "backfilled", details: { variant_name: v.name, ships_from: o.from, item_cost_cents: o.costCents, shipping_cents: ship, shipping_confirmed: false, stock: o.stock } as never });
        added++;
      }
      if (added) filled.variants_added = added;
    }
    if (adminEdited) filled.protected = "admin edited: only empty fields filled";
    await done("done", filled);
  } catch (e) { await done(attempts >= 3 ? "failed" : "failed", {}, (e as Error).message.slice(0, 300)); }
}

const MAX_QUOTES = 12; // bounded CJ calls per product

/** Stage 2: live CJ verification. Publishes only when >= 1 option has stock, confirmed US shipping and >= $2 net profit. */
async function qualifyOne(ctx: Ctx, productId: string): Promise<"published" | "hidden" | "skipped"> {
  const { db, cj } = ctx;
  const { data: p } = await db.from("bazaar_products").select("id,status").eq("id", productId).single();
  if (!p || (p.status !== "draft" && p.status !== "published")) return "skipped";
  const { data: links } = await db.from("bazaar_supplier_product_links").select("id,variant_id,supplier_item_ref,supplier_sku,review_status,price_override_cents").eq("product_id", productId).eq("supplier_id", ctx.supplierId);
  const live = (links ?? []).filter((l) => l.review_status !== "rejected" && l.supplier_sku && l.variant_id);
  const now = new Date().toISOString();
  const touch = () => db.from("bazaar_supplier_product_links").update({ last_synced_at: now }).eq("product_id", productId).eq("review_status", "rejected");
  if (!live.length) { await touch(); if (p.status === "published") await db.from("bazaar_products").update({ status: "paused" }).eq("id", productId); return "hidden"; }
  const d = await cj.getProductDetail(live[0].supplier_item_ref!);
  const inv = new Map((await cj.getInventoryByPid(d.ref)).map((v) => [v.vid, v.byCountry]));
  const results: ReturnType<typeof qualifyVariant>[] = [];
  let quotes = 0;
  for (const l of live) {
    const v = d.variants.find((x) => x.vid === l.supplier_sku);
    let r: ReturnType<typeof qualifyVariant>; let ship: number | null = null, days: string | null = null, from = "US", stock = 0, price: ReturnType<typeof landedPrice> | null = null;
    if (!v) r = { ok: false, reason: "out_of_stock" };
    else {
      const c = inv.get(v.vid) ?? {}; from = (c.US ?? 0) > 0 ? "US" : "CN"; stock = from === "US" ? c.US ?? 0 : c.CN ?? 0;
      if (stock > 0 && quotes < MAX_QUOTES) {
        quotes++;
        try { const best = cheapestQuote(await cj.calculateShipping({ startCountryCode: from, endCountryCode: "US", products: [{ vid: v.vid, quantity: 1 }] })); if (best) { ship = best.costCents; days = best.minDays != null ? `${best.minDays}-${best.maxDays}` : null; } } catch { ship = null; }
      }
      price = landedPrice(v.costCents, ship, ctx.rule);
      r = qualifyVariant({ stock, shippingConfirmed: ship != null, shippingCents: ship, priceCents: price.priceCents, profitCents: price.profitCents, belowFloor: price.belowFloor });
    }
    results.push(r);
    const linkPatch = r.ok
      ? { review_status: "approved", sync_status: "ok", supplier_cost_cents: v!.costCents + ship!, supplier_stock: stock, computed_price_cents: price!.priceCents, margin_cents: price!.profitCents, below_floor: false, last_synced_at: now, reviewed_at: now }
      : { review_status: v ? "pending" : "rejected", sync_status: v ? "unverified" : "discontinued", ...(price ? { computed_price_cents: price.priceCents, margin_cents: price.profitCents, below_floor: price.belowFloor } : {}), supplier_stock: stock, last_synced_at: null };
    // Options failing a hard rule are rejected so customers can never select them; transient quote limits stay pending for the next pass.
    if (!r.ok && (r.reason === "below_floor" || r.reason === "out_of_stock") ) linkPatch.review_status = "rejected";
    await db.from("bazaar_supplier_product_links").update(linkPatch as never).eq("id", l.id);
    await db.from("bazaar_product_variants").update(r.ok ? { price_cents: l.price_override_cents ?? price!.priceCents, quantity: stock, is_active: true } : { is_active: false, quantity: 0 }).eq("id", l.variant_id!);
    await db.from("bazaar_supplier_events").insert({ supplier_id: ctx.supplierId, link_id: l.id, event_type: r.ok ? "qualified" : "qualify_failed", details: { reason: r.ok ? null : r.reason, ships_from: from, stock, shipping_cents: ship, shipping_days: days, item_cost_cents: v?.costCents ?? null, price_cents: price?.priceCents ?? null, profit_cents: price?.profitCents ?? null, breakdown: price ? (price as unknown as { breakdown?: unknown }).breakdown ?? null : null } as never });
  }
  const dec = productDecision(results);
  if (dec.publish) {
    if (p.status !== "published") { const u = await db.from("bazaar_products").update({ status: "published", published_at: now }).eq("id", productId).eq("status", "draft"); if (u.error) throw new Error(u.error.message); }
    return "published";
  }
  if (p.status === "published") await db.from("bazaar_products").update({ status: "paused" }).eq("id", productId);
  const { data: o } = await db.from("bazaar_scan_outcomes").select("supplier_item_ref").eq("product_id", productId).limit(1).maybeSingle();
  if (o) await db.from("bazaar_scan_outcomes").update({ reason: `qualify:${dec.reason}`, updated_at: now }).eq("supplier_id", ctx.supplierId).eq("supplier_item_ref", o.supplier_item_ref);
  return "hidden";
}

/** Next product needing Stage 2: never-qualified drafts first, then published items whose check is going stale. */
async function nextToQualify(ctx: Ctx, skip: Set<string>): Promise<string | null> {
  const { db } = ctx;
  const excl = skip.size ? `(${[...skip].join(",")})` : "(00000000-0000-0000-0000-000000000000)";
  const { data: fresh } = await db.from("bazaar_supplier_product_links").select("product_id,bazaar_products!inner(status)").eq("supplier_id", ctx.supplierId).eq("review_status", "pending").eq("sync_status", "unverified").is("last_synced_at", null).eq("bazaar_products.status", "draft").not("product_id", "in", excl).order("created_at").limit(1);
  if (fresh?.[0]) return fresh[0].product_id;
  const cutoff = new Date(Date.now() - REQUALIFY_AFTER_HOURS * 3600_000).toISOString();
  const { data: stale } = await db.from("bazaar_supplier_product_links").select("product_id,bazaar_products!inner(status)").eq("supplier_id", ctx.supplierId).eq("review_status", "approved").lt("last_synced_at", cutoff).eq("bazaar_products.status", "published").not("product_id", "in", excl).order("last_synced_at").limit(1);
  return stale?.[0]?.product_id ?? null;
}

export async function runHostedTick(db: Db, opts: { budgetMs: number; cj?: CJDropshippingAdapter }) {
  const started = Date.now(), deadline = started + opts.budgetMs;
  const { data: sup } = await db.from("bazaar_suppliers").select("id").eq("name", CJ_SUPPLIER_NAME).eq("kind", "cj").maybeSingle();
  const { data: store } = await db.from("bazaar_stores").select("id").eq("slug", "pb-bazaar-direct").maybeSingle();
  if (!sup || !store) return { ran: false, reason: "supplier or store missing" };
  const owner = crypto.randomUUID();
  const { data: lease, error: le } = await db.rpc("bazaar_acquire_scan_lease", { p_supplier: sup.id, p_owner: owner, p_seconds: LEASE_SECONDS });
  if (le) throw new Error(le.message);
  const row = (lease as unknown as { checkpoint: BulkState }[] | null)?.[0];
  if (!row) return { ran: false, reason: "another worker holds the lease or the scan is paused/completed" };
  const { data: ruleRow } = await db.from("bazaar_pricing_rules").select("*").eq("scope", "default").limit(1).maybeSingle();
  if (!ruleRow) { await db.rpc("bazaar_release_scan_lease", { p_supplier: sup.id, p_owner: owner }); return { ran: false, reason: "no default pricing rule" }; }
  const { createCJAdapterFromEnv } = await import("./cjAdapter.server");
  const cj = opts.cj ?? await createCJAdapterFromEnv({ minIntervalMs: 1100 });
  const ctx: Ctx = { db, cj, supplierId: sup.id, storeId: store.id, rule: ruleRow as unknown as PricingRule, estShip: await shippingEstimates(db, sup.id) };
  const s: BulkState = row.checkpoint && (row.checkpoint as BulkState).cursor ? row.checkpoint : emptyState();
  const cats = (s.categories ?? await cj.getCategories()) as Cat[];
  s.categories = cats; s.categoriesTotal = cats.length;
  const save = (release: boolean, processed: number, err: string | null) => db.rpc("bazaar_save_scan_progress", { p_supplier: sup.id, p_owner: owner, p_checkpoint: s as never, p_category_id: (cats[s.cursor.catIndex]?.id ?? null) as string, p_processed: processed, p_done: !!s.cursor.done, p_error: err as string, p_release: release });
  let processed = 0, imported = 0, error: string | null = null, lost = false;
  const scanDeadline = started + Math.floor(opts.budgetMs * 0.45); // ~half the slice imports, the rest qualifies/backfills
  try {
    outer: while (!s.cursor.done && Date.now() < scanDeadline) {
      const cat = cats[s.cursor.catIndex];
      if (!cat) { s.cursor = { ...s.cursor, done: true }; break; }
      const page = await cj.searchProducts({ categoryId: cat.id, page: s.cursor.page, pageSize: BULK_PAGE_SIZE });
      for (let i = s.cursor.offset; i < page.items.length; i++) {
        if (Date.now() >= scanDeadline) break outer;
        const item = page.items[i];
        let res: { r: RejectReason | "imported"; productId: string | null };
        try { res = await importFast(ctx, item, cat); } catch { res = { r: "error", productId: null }; }
        await record(ctx, item.ref, cat, res.r, res.productId);
        if (res.r === "imported") imported++;
        processed++; s.cursor.offset = i + 1;
        const { data: kept } = await save(false, processed, null);
        if (!kept) { lost = true; break outer; } // lease lost: stop without overwriting another worker
      }
      if (s.cursor.offset >= page.items.length) s.cursor = advance(s.cursor, page.items.length, page.total, cats.length);
    }
  } catch (e) { error = (e as Error).message.slice(0, 400); }
  let backfilled = 0, published = 0, hidden = 0;
  if (!lost) {
    const tried = new Set<string>();
    while (Date.now() < deadline - 12_000) {
      const id = await nextToQualify(ctx, tried);
      if (!id) break;
      tried.add(id);
      try { const r = await qualifyOne(ctx, id); if (r === "published") published++; else if (r === "hidden") hidden++; }
      catch (e) { error = error ?? `qualify: ${(e as Error).message.slice(0, 200)}`; }
    }
    while (Date.now() < deadline - 3_000) {
      const { data: next } = await db.from("bazaar_backfill_queue").select("product_id").eq("supplier_id", sup.id).eq("status", "pending").order("updated_at").limit(1).maybeSingle();
      if (!next) break;
      await backfillOne(ctx, next.product_id); backfilled++;
    }
    await save(true, processed, error);
  }
  return { ran: true, processed, imported, backfilled, published, hidden, error, done: !!s.cursor.done, ms: Date.now() - started, category: cats[s.cursor.catIndex] ? `${cats[s.cursor.catIndex].top} › ${cats[s.cursor.catIndex].name}` : null };
}
