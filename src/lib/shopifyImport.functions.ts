import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { markupCents, variantOptions, shopifySku, stripHtml, type ShopifyProduct } from "./shopifyImport";

async function assertAdmin(db: any, uid: string) {
  const { data } = await db.rpc("is_bazaar_admin", { _uid: uid });
  if (!data) throw new Error("Admins only.");
}
function creds() {
  const domain = (process.env["SHOPIFY_STORE_DOMAIN"] ?? "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const token = process.env["SHOPIFY_STOREFRONT_PRIVATE_TOKEN"] ?? "";
  if (!domain || !token) throw new Error("Shopify isn't connected yet. Add your store domain and private Storefront token.");
  return { domain, token };
}
const tail = (gid: string) => Number(gid.split("/").pop());
const PRODUCT = `id title descriptionHtml vendor images(first:12){nodes{url}} options{name} variants(first:100){nodes{id title sku price{amount} availableForSale selectedOptions{name value}}}`;
function toProduct(n: any): ShopifyProduct {
  return { id: tail(n.id), title: n.title, body_html: n.descriptionHtml, vendor: n.vendor, product_type: null, images: n.images.nodes.map((i: any) => ({ src: i.url })), options: n.options,
    variants: n.variants.nodes.map((v: any) => { const o = n.options.map((op: any) => v.selectedOptions.find((s: any) => s.name === op.name)?.value ?? null);
      return { id: tail(v.id), title: v.title, sku: v.sku, price: v.price.amount, inventory_quantity: 0, option1: o[0], option2: o[1], option3: o[2] }; }) };
}
async function storefront(query: string, variables: Record<string, unknown> = {}) {
  const { domain, token } = creds();
  const res = await fetch(`https://${domain}/api/2024-10/graphql.json`, { method: "POST", headers: { "Shopify-Storefront-Private-Token": token, "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }) });
  if (res.status === 401 || res.status === 403) throw new Error("Shopify rejected the Storefront token. Check it's the private token and product access is enabled.");
  if (!res.ok) throw new Error(`Shopify returned an error (${res.status}).`);
  const j = await res.json();
  if (j.errors?.length) throw new Error(`Shopify: ${j.errors[0].message}`);
  return j.data;
}
async function listAll(): Promise<ShopifyProduct[]> { const d = await storefront(`{products(first:100){nodes{${PRODUCT}}}}`); return d.products.nodes.map(toProduct); }
async function getOne(id: number): Promise<ShopifyProduct> { const d = await storefront(`query($id:ID!){product(id:$id){${PRODUCT}}}`, { id: `gid://shopify/Product/${id}` }); if (!d.product) throw new Error("Product not found in Shopify."); return toProduct(d.product); }

/** Lists Shopify products for admin review (no writes). */
export const listShopifyProducts = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ markupPct: z.number().min(0).max(500) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    try {
      const products = await listAll();
      const skus = products.flatMap((p) => p.variants.map(shopifySku));
      const { data: existing } = skus.length ? await context.supabase.from("bazaar_product_variants").select("sku").in("sku", skus) : { data: [] };
      const have = new Set((existing ?? []).map((r: any) => r.sku));
      return { error: null, products: products.map((p) => ({ id: p.id, title: p.title, image: p.images[0]?.src ?? null, variants: p.variants.length,
        fromCents: Math.min(...p.variants.map((v) => markupCents(v.price, data.markupPct))), imported: p.variants.some((v) => have.has(shopifySku(v))) })) };
    } catch (e) { return { error: e instanceof Error ? e.message : "Couldn't reach Shopify", products: [] }; }
  });

/** Imports selected Shopify products into PB Bazaar Direct as hidden drafts with markup applied. */
export const importShopifyProducts = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ ids: z.array(z.number().int().positive()).min(1).max(50), markupPct: z.number().min(0).max(500) }).parse(i))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    await assertAdmin(db, context.userId);
    try {
      const { data: store } = await db.from("bazaar_stores").select("id").eq("slug", "pb-bazaar-direct").maybeSingle();
      if (!store) return { error: "PB Bazaar Direct store is missing.", imported: 0, skipped: 0 };
      let imported = 0, skipped = 0;
      for (const id of data.ids) {
        const p = await getOne(id);
        const skus = p.variants.map(shopifySku);
        const { data: dup } = await db.from("bazaar_product_variants").select("id").in("sku", skus).limit(1);
        if (dup?.length) { skipped++; continue; }
        const prod = await db.from("bazaar_products").insert({ store_id: store.id, title: p.title.slice(0, 160), description: stripHtml(p.body_html) || null, brand: p.vendor || null, images: p.images.map((i) => i.src).slice(0, 12), status: "draft", condition: "new" }).select("id").single();
        if (prod.error) throw new Error(prod.error.message);
        for (const v of p.variants) {
          const vr = await db.from("bazaar_product_variants").insert({ product_id: prod.data.id, sku: shopifySku(v), options: variantOptions(p, v), price_cents: markupCents(v.price, data.markupPct), quantity: Math.max(0, v.inventory_quantity ?? 0), is_active: false });
          if (vr.error) throw new Error(vr.error.message);
        }
        imported++;
      }
      return { error: null, imported, skipped };
    } catch (e) { return { error: e instanceof Error ? e.message : "Import failed", imported: 0, skipped: 0 }; }
  });
