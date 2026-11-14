import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Signs a Bazaar media path only if it belongs to a published product in an active store, or an active store's logo/cover. */
export const signPublicBazaarMedia = createServerFn({ method: "POST" })
  .inputValidator((input: { path: string }) =>
    z.object({ path: z.string().min(3).max(500).regex(/^[0-9a-f-]{36}\/[^\s]+$/) }).parse(input))
  .handler(async ({ data }): Promise<string | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = data.path;
    const storeId = path.split("/")[0];
    const { data: store } = await supabaseAdmin.from("bazaar_stores")
      .select("id,status,logo_url,cover_url").eq("id", storeId).maybeSingle();
    if (!store || store.status !== "active") return null;
    let allowed = store.logo_url === path || store.cover_url === path;
    if (!allowed) {
      const { data: prod } = await supabaseAdmin.from("bazaar_products").select("id")
        .eq("store_id", storeId).eq("status", "published").contains("images", [path]).limit(1);
      allowed = !!prod?.length;
    }
    if (!allowed) return null;
    const { data: signed } = await supabaseAdmin.storage.from("bazaar-media").createSignedUrl(path, 3600);
    return signed?.signedUrl ?? null;
  });
