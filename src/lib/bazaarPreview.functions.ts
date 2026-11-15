import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ShoppingProduct } from "./bazaarShopping";

/** Admin/owner-only read of private_test products for test-mode checkout. Never used by public pages. */
export const getBazaarPrivateTestProducts = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ ids: z.array(z.string().uuid()).max(100) }).parse(i))
  .handler(async ({ data, context }): Promise<ShoppingProduct[]> => {
    if (!data.ids.length) return [];
    const [a, o] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "owner" }),
    ]);
    if (!a.data && !o.data) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.from("bazaar_products")
      .select("id,title,description,department,brand,model,condition,specifications,images,status,bazaar_stores!inner(id,slug,name,store_type,verification_status,logo_url,shipping_policy,return_policy,processing_days,status),bazaar_product_variants(id,sku,options,price_cents,compare_at_cents,quantity,is_active)")
      .in("id", [...new Set(data.ids)]).eq("status", "private_test").in("bazaar_stores.status", ["active", "private_test"]).eq("bazaar_stores.slug", "pb-bazaar-direct");
    if (error) throw new Error("Couldn't load private test products.");
    return (rows ?? []).map(({ status: _s, bazaar_stores: { status: _ss, ...store }, bazaar_product_variants: vs, ...p }) => ({
      ...p, images: p.images ?? [], bazaar_stores: store,
      bazaar_product_variants: vs.filter((v) => v.is_active).map((v) => ({ ...v, available: v.quantity > 0, reason: v.quantity > 0 ? null : "sold_out" as const })),
    })) as ShoppingProduct[];
  });
