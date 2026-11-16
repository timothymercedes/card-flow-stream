import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Applies a store coupon to the signed-in buyer's unpaid orders; the database function enforces every rule atomically. */
export const applyStoreCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    orderIds: z.array(z.string().uuid()).min(1).max(50),
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3,20}$/, "Enter a valid code"),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: discount, error } = await (supabaseAdmin as any).rpc("redeem_store_coupon", { _buyer: context.userId, _order_ids: data.orderIds, _code: data.code });
    if (error) return { error: error.message as string };
    return { discount: Number(discount) };
  });
