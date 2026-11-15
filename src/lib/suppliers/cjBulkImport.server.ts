/** Server-only resumable CJ catalog scan → PB Bazaar Direct DRAFTS. Never orders, pays or publishes. */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { PricingRule } from "@/lib/bazaarPricing";
import type { CJDropshippingAdapter } from "./cjAdapter.server";
import { cheapestQuote, htmlToText } from "./cjImport";
import { advance, bump, departmentFor, emptyState, pickOptions, priceOption, BULK_PAGE_SIZE, type BulkState, type RejectReason } from "./cjBulk";

type Db = SupabaseClient<Database>;
export const CHECKPOINT_EVENT = "bulk_checkpoint";

export async function loadState(db: Db, supplierId: string): Promise<BulkState> {
  const { data } = await db.from("bazaar_supplier_events").select("details").eq("supplier_id", supplierId).eq("event_type", CHECKPOINT_EVENT).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return (data?.details as unknown as BulkState) ?? emptyState();
}
async function saveState(db: Db, supplierId: string, userId: string, s: BulkState) {
  const { error } = await db.from("bazaar_supplier_events").insert({ supplier_id: supplierId, event_type: CHECKPOINT_EVENT, actor: userId, details: s as never });
  if (error) throw new Error(`Couldn't save scan progress: ${error.message}`);
}

type Ctx = { db: Db; cj: CJDropshippingAdapter; userId: string; supplierId: string; storeId: string; rule: PricingRule };

async function processOne(ctx: Ctx, item: { ref: string; imageUrl: string | null }, top: string): Promise<RejectReason | "imported"> {
  const { db, cj } = ctx;
  if (!item.imageUrl) return "no_image";
  const dup = await db.from("bazaar_supplier_product_links").select("id").eq("supplier_id", ctx.supplierId).eq("supplier_item_ref", item.ref).limit(1);
  if (dup.data?.length) return "duplicate";
  const d = await cj.getProductDetail(item.ref);
  if (!d.images.length) return "no_image";
  if (!d.variants.length) return "no_options";
  const inv = new Map((await cj.getInventoryByPid(d.ref)).map((v) => [v.vid, v.byCountry]));
  const picked = pickOptions(d.variants.map((v) => { const c = inv.get(v.vid) ?? {}; const us = c.US ?? 0; return { vid: v.vid, costCents: v.costCents, stockUS: us, stockOther: Object.values(c).reduce((n, x) => n + x, 0) - us }; }));
  if (!picked.length) return "out_of_stock";
  const priced = [];
  for (const o of picked) {
    let q = null;
    try { q = cheapestQuote(await cj.calculateShipping({ startCountryCode: o.from, endCountryCode: "US", products: [{ vid: o.vid, quantity: 1 }] })); } catch { q = null; }
    if (!q) continue;
    priced.push({ o, q, p: priceOption(o.costCents, q.costCents, ctx.rule), v: d.variants.find((x) => x.vid === o.vid)! });
  }
  if (!priced.length) return "no_us_shipping";
  const ok = priced.filter((x) => !x.p.belowFloor);
  if (!ok.length) return "below_floor";
  const skuDup = await db.from("bazaar_supplier_product_links").select("id").eq("supplier_id", ctx.supplierId).in("supplier_sku", ok.map((x) => x.o.vid)).limit(1);
  if (skuDup.data?.length) return "duplicate";

  const prod = await db.from("bazaar_products").insert({ store_id: ctx.storeId, title: (d.title || "Untitled").slice(0, 160), description: htmlToText(d.description) || null, department: departmentFor(top), images: d.images.slice(0, 12), status: "draft", condition: "new" }).select("id").single();
  if (prod.error) throw new Error(prod.error.message);
  const now = new Date().toISOString();
  try {
    for (const { o, q, p, v } of ok) {
      const vr = await db.from("bazaar_product_variants").insert({ product_id: prod.data.id, options: v.options, price_cents: p.priceCents, quantity: o.stock, is_active: true }).select("id").single();
      if (vr.error) throw new Error(vr.error.message);
      const lr = await db.from("bazaar_supplier_product_links").insert({ supplier_id: ctx.supplierId, product_id: prod.data.id, variant_id: vr.data.id, supplier_item_ref: d.ref, supplier_sku: o.vid, supplier_cost_cents: o.costCents + q.costCents, supplier_stock: o.stock, currency: "USD", computed_price_cents: p.priceCents, margin_cents: p.profitCents, below_floor: false, review_status: "pending", sync_status: "ok", last_synced_at: now }).select("id").single();
      if (lr.error) throw new Error(lr.error.message);
      await db.from("bazaar_supplier_events").insert({ supplier_id: ctx.supplierId, link_id: lr.data.id, event_type: "imported", actor: ctx.userId, details: { bulk: true, cj_category: top, ships_from: o.from, item_cost_cents: o.costCents, shipping_cents: q.costCents, shipping_method: q.method, shipping_confirmed: true, shipping_days: q.minDays != null ? `${q.minDays}–${q.maxDays} days` : null, stock: o.stock, price_cents: p.priceCents, breakdown: p.breakdown } as never });
    }
  } catch (e) { await db.from("bazaar_products").delete().eq("id", prod.data.id); throw e; }
  return "imported";
}

/** Processes products until the deadline, saving progress so the next call resumes exactly where this stopped. */
export async function runBulkBatch(ctx: Ctx, deadline: number) {
  const s = await loadState(ctx.db, ctx.supplierId);
  if (s.cursor.done) return { state: s, processed: 0, done: true };
  const cats = await ctx.cj.getCategories();
  s.categoriesTotal = cats.length;
  const job = await ctx.db.from("bazaar_supplier_sync_jobs").insert({ supplier_id: ctx.supplierId, kind: "bulk_import", started_by: ctx.userId }).select("id").single();
  let processed = 0, imported = 0, sinceSave = 0, error: string | null = null;
  try {
    outer: while (!s.cursor.done && Date.now() < deadline) {
      const cat = cats[s.cursor.catIndex];
      if (!cat) { s.cursor = { ...s.cursor, done: true }; break; }
      const page = await ctx.cj.searchProducts({ categoryId: cat.id, page: s.cursor.page, pageSize: BULK_PAGE_SIZE });
      for (let i = s.cursor.offset; i < page.items.length; i++) {
        if (Date.now() >= deadline) { s.cursor.offset = i; break outer; }
        bump(s, cat.top, "discovered");
        let r: RejectReason | "imported";
        try { r = await processOne(ctx, page.items[i], cat.top); } catch { r = "error"; }
        if (r === "imported") { bump(s, cat.top, "eligible"); bump(s, cat.top, "imported"); imported++; } else bump(s, cat.top, r);
        processed++; s.cursor.offset = i + 1;
        if (++sinceSave >= 5) { await saveState(ctx.db, ctx.supplierId, ctx.userId, s); sinceSave = 0; }
      }
      s.cursor = advance(s.cursor, page.items.length, page.total, cats.length);
    }
  } catch (e) { error = (e as Error).message.slice(0, 400); }
  await saveState(ctx.db, ctx.supplierId, ctx.userId, s);
  if (job.data) await ctx.db.from("bazaar_supplier_sync_jobs").update({ status: error ? "failed" : "succeeded", error, items_seen: processed, items_changed: imported, finished_at: new Date().toISOString() }).eq("id", job.data.id);
  return { state: s, processed, imported, done: !!s.cursor.done, error, category: cats[s.cursor.catIndex] ? `${cats[s.cursor.catIndex].top} › ${cats[s.cursor.catIndex].parent} › ${cats[s.cursor.catIndex].name}` : null };
}
