import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { catalogRange, catalogSort, draftBulkStatus } from "./bazaarCatalog";

const input = z.object({ page: z.number().int().min(1), search: z.string().trim().max(200).default(""), category: z.string().max(80).default("all"), status: z.enum(["all", "draft", "paused", "private_test"]).default("all"), sort: z.enum(["newest", "oldest", "title"]).default("newest") });
export const getBazaarCatalogPage = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => input.parse(value))
  .handler(async ({ context, data }) => {
    const db = context.supabase;
    const { data: admin, error: roleError } = await db.rpc("is_bazaar_admin", { _uid: context.userId });
    if (roleError || !admin) throw new Error("Admins only.");
    let query = db.from("bazaar_products").select("id,title,status,department,images,created_at,bazaar_stores!inner(slug),bazaar_supplier_product_links(*,bazaar_suppliers(name,is_demo),bazaar_supplier_events(event_type,details,created_at))", { count: "exact" }).eq("bazaar_stores.slug", "pb-bazaar-direct");
    if (data.search) query = query.ilike("title", `%${data.search.replace(/[%_\\]/g, "\\$&")}%`);
    if (data.category !== "all") query = query.eq("department", data.category);
    if (data.status !== "all") query = query.eq("status", data.status);
    const sort = catalogSort[data.sort];
    const [start, end] = catalogRange(data.page);
    const { data: rows, count, error } = await query.order(sort.column, { ascending: sort.ascending }).order("id", { ascending: true }).range(start, end);
    if (error) throw new Error(error.message);
    return { products: rows ?? [], total: count ?? 0 };
  });

/** Explicit selections only; no publish, checkout or supplier ordering action exists here. */
export const bulkBazaarCatalogAction = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => z.object({ ids: z.array(z.string().uuid()).min(1).max(100), action: z.enum(["draft", "pause", "reject"]) }).parse(value))
  .handler(async ({ context, data }) => {
    const db = context.supabase;
    const { data: admin, error: roleError } = await db.rpc("is_bazaar_admin", { _uid: context.userId });
    if (roleError || !admin) throw new Error("Admins only.");
    const ids = [...new Set(data.ids)];
    const { data: rows, error } = await db.from("bazaar_products").select("id,status,bazaar_stores!inner(slug)").in("id", ids).eq("bazaar_stores.slug", "pb-bazaar-direct");
    if (error || rows?.length !== ids.length) throw new Error("Some selected products are unavailable.");
    if (rows.some((p) => p.status === "private_test" || p.status === "published")) throw new Error("Test and published products are excluded from draft bulk actions.");
    if (data.action === "reject") {
      const result = await db.from("bazaar_supplier_product_links").update({ review_status: "rejected", reviewed_by: context.userId, reviewed_at: new Date().toISOString() }).in("product_id", ids);
      if (result.error) throw new Error(result.error.message);
    } else {
      const result = await db.from("bazaar_products").update({ status: draftBulkStatus[data.action] }).in("id", ids).in("status", ["draft", "paused"]);
      if (result.error) throw new Error(result.error.message);
    }
    return { changed: ids.length };
  });