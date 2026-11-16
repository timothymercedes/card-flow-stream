import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ShoppingProduct } from "./bazaarShopping";

// Products still awaiting live supplier qualification. Only safe display columns are returned:
// never prices, supplier costs, supplier IDs or links. These items are never purchasable —
// checkout independently requires status='published' and verified options.
const SAFE = "id,title,description,department,brand,model,condition,specifications,images,created_at,bazaar_stores!inner(id,slug,name,store_type,verification_status,logo_url,shipping_policy,return_policy,processing_days,status),bazaar_supplier_product_links!inner(bazaar_suppliers!inner(is_demo,kind))";

type Row = Omit<ShoppingProduct, "bazaar_product_variants" | "bazaar_stores"> & { created_at: string; bazaar_stores: ShoppingProduct["bazaar_stores"] & { status?: string }; bazaar_supplier_product_links?: unknown };

function clean(r: Row): ShoppingProduct & { checking: true } {
  const { bazaar_supplier_product_links: _l, created_at: _c, ...rest } = r;
  const { status: _s, ...store } = r.bazaar_stores;
  return { ...rest, bazaar_stores: store, bazaar_product_variants: [], checking: true };
}

async function admin() { return (await import("@/integrations/supabase/client.server")).supabaseAdmin; }
function query(db: Awaited<ReturnType<typeof admin>>) {
  return db.from("bazaar_products").select(SAFE).eq("status", "draft")
    .eq("bazaar_stores.status", "active").eq("bazaar_supplier_product_links.bazaar_suppliers.is_demo", false).eq("bazaar_supplier_product_links.bazaar_suppliers.kind", "cj");
}

export const listComingSoonProducts = createServerFn({ method: "GET" })
  .inputValidator((i: { dept?: string }) => z.object({ dept: z.string().max(60).optional() }).parse(i))
  .handler(async ({ data }) => {
    let q = query(await admin()).order("created_at", { ascending: false }).limit(1000);
    if (data.dept) q = q.eq("department", data.dept);
    const { data: rows, error } = await q;
    if (error) throw new Error("Couldn't load the catalog.");
    const seen = new Set<string>();
    return ((rows ?? []) as unknown as Row[]).filter((r) => !seen.has(r.id) && seen.add(r.id)).map(clean);
  });

export const getComingSoonProduct = createServerFn({ method: "GET" })
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { data: rows, error } = await query(await admin()).eq("id", data.id).limit(1);
    if (error) throw new Error("Couldn't load this product.");
    const r = (rows ?? [])[0] as unknown as Row | undefined;
    return r ? clean(r) : null;
  });
