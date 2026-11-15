/**
 * Admin-only CJdropshipping discovery and DRAFT import for PB Bazaar Direct.
 * Never creates CJ orders, never pays, never publishes. Costs/IDs stay in admin-only tables.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CJ_SUPPLIER_NAME, cheapestQuote, htmlToText, landedPrice, profitBreakdown, type ProfitBreakdown } from "@/lib/suppliers/cjImport";
import type { PricingRule } from "@/lib/bazaarPricing";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Db = SupabaseClient<Database>;
async function assertAdmin(db: Db, uid: string) {
  const { data } = await db.rpc("is_bazaar_admin", { _uid: uid });
  if (!data) throw new Error("Admins only.");
}
async function adapter() {
  const { createCJAdapterFromEnv } = await import("@/lib/suppliers/cjAdapter.server");
  return createCJAdapterFromEnv();
}
function friendly(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/not connected/i.test(m)) return "CJdropshipping isn't connected yet. Add the CJ API key to connect.";
  if (/authoriz/i.test(m)) return "CJ rejected the API key. Check the key in your CJ account.";
  if (/rate/i.test(m)) return "CJ is limiting requests right now. Wait a minute and try again.";
  return `CJ request failed: ${m.slice(0, 200)}`;
}
async function defaultRule(db: Db): Promise<PricingRule> {
  const { data, error } = await db.from("bazaar_pricing_rules").select("*").eq("scope", "default").limit(1).maybeSingle();
  if (error || !data) throw new Error("Set a default pricing rule first (Pricing tab).");
  return data as unknown as PricingRule;
}

export const getCJStatus = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await assertAdmin(context.supabase, context.userId);
  const configured = !!process.env.CJ_API_KEY;
  const { data: row } = await context.supabase.from("bazaar_suppliers").select("id,status").eq("name", CJ_SUPPLIER_NAME).eq("kind", "cj").maybeSingle();
  const base = { configured, sandbox: process.env.CJ_MODE !== "live", ordersEnabled: process.env.CJ_ORDERS_ENABLED === "true", supplierRegistered: !!row };
  if (!configured) return { ...base, ok: false, tested: false, message: "Not connected — no CJ API key has been added." };
  return { ...base, ok: true, tested: false, message: "API key added. Use Test connection to verify it with CJ." };
});

/** Real sign-in + refresh-token exchange against CJ. Reports pass/fail only, never token values. */
export const testCJConnection = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await assertAdmin(context.supabase, context.userId);
  if (!process.env.CJ_API_KEY) return { ok: false, loggedIn: false, refreshed: false, message: "No CJ API key has been added." };
  let loggedIn = false;
  try {
    const cj = await adapter();
    await cj.getAccessToken(); loggedIn = true;
    await cj.verifyRefresh();
    return { ok: true, loggedIn: true, refreshed: true, message: "CJ accepted the API key and the access refresh worked." };
  } catch (e) { return { ok: false, loggedIn, refreshed: false, message: friendly(e) }; }
});

export const searchCJProducts = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ keyword: z.string().max(200).optional(), pid: z.string().max(80).optional(), categoryId: z.string().max(80).optional(), page: z.number().int().min(1).max(500).default(1) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    try {
      const cj = await adapter();
      if (data.pid?.trim()) {
        const d = await cj.getProductDetail(data.pid.trim());
        return { error: null, total: 1, items: [{ ref: d.ref, title: d.title, imageUrl: d.images[0] ?? null, costCents: d.variants.length ? Math.min(...d.variants.map((v) => v.costCents)) : null, categoryName: d.categoryName }] };
      }
      if (!data.keyword?.trim() && !data.categoryId?.trim()) return { error: "Enter a keyword, CJ product ID or category ID.", total: 0, items: [] };
      const r = await cj.searchProducts({ keyword: data.keyword, categoryId: data.categoryId || undefined, page: data.page, pageSize: 20 });
      return { error: null, ...r };
    } catch (e) { return { error: friendly(e), total: 0, items: [] }; }
  });

type VariantView = { vid: string; sku: string | null; name: string | null; options: Record<string, string>; imageUrl: string | null; stock: number | null; itemCostCents: number; shippingCents: number | null; shippingMethod: string | null; shippingDays: string | null; shippingEstimated: boolean; shippingConfirmed: boolean; priceCents: number; profitCents: number; marginPercent: number; belowFloor: boolean; breakdown: ProfitBreakdown };
async function loadDetail(db: Db, pid: string, quoteVids?: Set<string>) {
  const cj = await adapter();
  const rule = await defaultRule(db);
  const d = await cj.getProductDetail(pid);
  const variants = d.variants.slice(0, 40);
  const out: VariantView[] = []; let fallback: { costCents: number; method: string; days: string | null } | null = null;
  for (const [i, v] of variants.entries()) {
    let stock: number | null = null;
    try { stock = (await cj.getStock(v.vid)).reduce((n, s) => n + s.quantity, 0); } catch { stock = null; }
    let q: { costCents: number; method: string; days: string | null } | null = null; let estimated = false;
    if (quoteVids ? quoteVids.has(v.vid) : i < 10) {
      try { const best = cheapestQuote(await cj.calculateShipping({ startCountryCode: "CN", endCountryCode: "US", products: [{ vid: v.vid, quantity: 1 }] })); if (best) q = { costCents: best.costCents, method: best.method, days: best.minDays != null ? `${best.minDays}–${best.maxDays} days` : null }; } catch { q = null; }
      if (q && !fallback) fallback = q;
    }
    if (!q && fallback) { q = fallback; estimated = true; }
    const p = landedPrice(v.costCents, q?.costCents ?? null, rule);
    out.push({ vid: v.vid, sku: v.sku, name: v.name, options: v.options, imageUrl: v.imageUrl ?? null, stock, itemCostCents: v.costCents, shippingCents: q?.costCents ?? null, shippingMethod: q?.method ?? null, shippingDays: q?.days ?? null, shippingEstimated: estimated, shippingConfirmed: !!q && !estimated, priceCents: p.priceCents, profitCents: p.profitCents, marginPercent: p.marginPercent, belowFloor: p.belowFloor, breakdown: profitBreakdown(v.costCents, q?.costCents ?? null, rule) });
  }
  return { ref: d.ref, title: d.title, description: htmlToText(d.description), images: d.images.slice(0, 12), categoryName: d.categoryName, variants: out, truncated: d.variants.length > variants.length };
}

export const getCJProductDetail = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ pid: z.string().min(1).max(80) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    try { return { error: null, product: await loadDetail(context.supabase, data.pid) }; }
    catch (e) { return { error: friendly(e), product: null }; }
  });

export const importCJProduct = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ pid: z.string().min(1).max(80), vids: z.array(z.string().min(1).max(80)).min(1).max(40), title: z.string().trim().min(2).max(160), description: z.string().max(5000).optional(), department: z.string().max(60).nullable().optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    await assertAdmin(db, context.userId);
    try {
      // Re-fetch from CJ on the server: never trust browser-supplied costs, stock or prices.
      const p = await loadDetail(db, data.pid, new Set(data.vids)); // quote every selected option individually
      const chosen = p.variants.filter((v) => data.vids.includes(v.vid));
      if (chosen.length !== new Set(data.vids).size) return { error: "Some selected options are no longer offered by CJ. Reload the product.", productId: null };
      const { data: store } = await db.from("bazaar_stores").select("id").eq("slug", "pb-bazaar-direct").maybeSingle();
      if (!store) return { error: "PB Bazaar Direct store is missing.", productId: null };
      const { data: sup } = await db.from("bazaar_suppliers").select("id").eq("name", CJ_SUPPLIER_NAME).eq("kind", "cj").maybeSingle();
      if (!sup) return { error: "CJdropshipping isn't registered as a supplier yet. Importing stays off until it is.", productId: null };
      // Duplicate guard: a CJ product (or any of its options) may only be imported once.
      const { data: dup } = await db.from("bazaar_supplier_product_links").select("supplier_sku, product_id").eq("supplier_id", sup.id).eq("supplier_item_ref", p.ref);
      if (dup?.length) return { error: `This CJ product was already imported (${dup.length} option${dup.length === 1 ? "" : "s"}). Review it on the Imports tab.`, productId: null };
      const { data: skuDup } = await db.from("bazaar_supplier_product_links").select("id").eq("supplier_id", sup.id).in("supplier_sku", chosen.map((v) => v.vid)).limit(1);
      if (skuDup?.length) return { error: "One of these options is already imported under another product.", productId: null };
      const unsellable = chosen.filter((v) => v.stock == null || v.stock <= 0);
      if (unsellable.length === chosen.length) return { error: "CJ reports none of the selected options in stock right now.", productId: null };

      const { data: job } = await db.from("bazaar_supplier_sync_jobs").insert({ supplier_id: sup.id, kind: "import", started_by: context.userId }).select("id").single();
      const prod = await db.from("bazaar_products").insert({ store_id: store.id, title: data.title, description: (data.description ?? p.description) || null, department: data.department ?? null, images: p.images, status: "draft", condition: "new" }).select("id").single();
      if (prod.error) throw new Error(prod.error.message);
      const now = new Date().toISOString(); let made = 0;
      try {
        for (const v of chosen) {
          const vr = await db.from("bazaar_product_variants").insert({ product_id: prod.data.id, options: v.options, price_cents: v.priceCents, quantity: Math.max(0, v.stock ?? 0), is_active: (v.stock ?? 0) > 0 && v.shippingConfirmed }).select("id").single();
          if (vr.error) throw new Error(vr.error.message);
          const lr = await db.from("bazaar_supplier_product_links").insert({ supplier_id: sup.id, product_id: prod.data.id, variant_id: vr.data.id, supplier_item_ref: p.ref, supplier_sku: v.vid, supplier_cost_cents: v.itemCostCents + (v.shippingCents ?? 0), supplier_stock: v.stock, currency: "USD", computed_price_cents: v.priceCents, margin_cents: v.profitCents, below_floor: v.belowFloor, review_status: "pending", sync_status: v.stock == null || !v.shippingConfirmed ? "unverified" : "ok", last_synced_at: v.stock == null || !v.shippingConfirmed ? null : now }).select("id").single();
          if (lr.error) throw new Error(lr.error.message);
          await db.from("bazaar_supplier_events").insert({ supplier_id: sup.id, link_id: lr.data.id, event_type: "imported", actor: context.userId, details: { item_cost_cents: v.itemCostCents, shipping_cents: v.shippingCents, shipping_method: v.shippingMethod, shipping_estimated: v.shippingEstimated, shipping_confirmed: v.shippingConfirmed, shipping_days: v.shippingDays, stock: v.stock, price_cents: v.priceCents, breakdown: v.breakdown } });
          made++;
        }
      } catch (e) {
        await db.from("bazaar_products").delete().eq("id", prod.data.id); // roll back the partial draft
        if (job) await db.from("bazaar_supplier_sync_jobs").update({ status: "failed", error: String((e as Error).message).slice(0, 500), items_seen: chosen.length, finished_at: new Date().toISOString() }).eq("id", job.id);
        throw e;
      }
      if (job) await db.from("bazaar_supplier_sync_jobs").update({ status: "succeeded", items_seen: chosen.length, items_changed: made, finished_at: new Date().toISOString() }).eq("id", job.id);
      return { error: null, productId: prod.data.id };
    } catch (e) { return { error: friendly(e), productId: null }; }
  });
