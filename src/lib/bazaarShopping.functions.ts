import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import type { ShoppingProduct } from "./bazaarShopping";

export const getBazaarShoppingProducts = createServerFn({ method: "POST" })
  .inputValidator((input: { ids: string[] }) => z.object({ ids: z.array(z.string().uuid()).max(100) }).parse(input))
  .handler(async ({ data }): Promise<ShoppingProduct[]> => {
    if (!data.ids.length) return [];
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) throw new Error("Shopping is temporarily unavailable.");
    // Always use anonymous public RLS, even for signed-in staff viewing shopping pages.
    const client = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      } },
    });
    const { data: products, error } = await client.from("bazaar_products")
      .select("id,title,description,department,brand,model,condition,specifications,images,bazaar_stores!inner(id,slug,name,store_type,verification_status,logo_url,shipping_policy,return_policy,processing_days)")
      .in("id", [...new Set(data.ids)]).eq("status", "published").eq("bazaar_stores.status", "active").limit(100);
    if (error) throw new Error("Couldn't verify product availability. Please try again.");
    const ids = (products ?? []).map((p) => p.id);
    const { data: variants, error: vErr } = ids.length ? await client.rpc("bazaar_public_variant_availability", { _product_ids: ids }) : { data: [], error: null };
    if (vErr) throw new Error("Couldn't verify product availability. Please try again.");
    // Sold-out options stay visible; unavailable/discontinued ones are hidden. No supplier data is ever returned.
    return (products ?? []).map((p) => ({ ...p, bazaar_product_variants: (variants ?? [])
      .filter((v) => v.product_id === p.id && v.reason !== "unavailable")
      .map((v) => ({ id: v.id, sku: v.sku, options: v.options, price_cents: v.price_cents, compare_at_cents: v.compare_at_cents, quantity: v.quantity, is_active: true, available: v.available, reason: v.reason as ShoppingProduct["bazaar_product_variants"][number]["reason"], delivery_min_days: v.delivery_min_days, delivery_max_days: v.delivery_max_days })) }));
  });