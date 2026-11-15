import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const line = z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1).max(50) });
const address = z.object({ name: z.string().max(120), line1: z.string().max(200), line2: z.string().max(200).optional(), city: z.string().max(100), state: z.string().max(2), postalCode: z.string().max(10), country: z.literal("US"), phone: z.string().max(30).optional() });

/** Shared by Buy Now and cart checkout. Test mode only. */
export const startBazaarCheckout = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ source: z.enum(["buy_now", "cart"]), items: z.array(line).min(1).max(50), address, environment: z.enum(["sandbox", "live"]) }).parse(i))
  .handler(async ({ data, context }) => {
    if (data.environment !== "sandbox") return { error: "PB Bazaar checkout is in test mode only right now." };
    const origin = new URL(getRequest().url).origin;
    const email = (context.claims as { email?: string } | undefined)?.email ?? null;
    // Private test items: only verified admins/owners, and this function is already sandbox-only.
    const allowPrivateTest = await assertOrderAdmin(context.supabase, context.userId).then(() => true, () => false);
    const { startBazaarCheckout: start } = await import("@/lib/bazaarCheckout.server");
    return start({ userId: context.userId, email, source: data.source, items: data.items, address: data.address, returnOrigin: origin, allowPrivateTest });
  });

async function assertOrderAdmin(supabase: any, userId: string) {
  const [a, o] = await Promise.all([supabase.rpc("has_role", { _user_id: userId, _role: "admin" }), supabase.rpc("has_role", { _user_id: userId, _role: "owner" })]);
  if (!a.data && !o.data) throw new Error("Admins only.");
}

export const approveBazaarFulfillment = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ orderId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertOrderAdmin(context.supabase, context.userId);
    const { authorizeBazaarFulfillment } = await import("@/lib/bazaarCheckout.server");
    return authorizeBazaarFulfillment(data.orderId, context.userId);
  });
