// Payout server functions — gates against v_seller_available_balance and
// allocates payouts back to orders FIFO on success.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

export const getAvailableBalance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;

    const { data: bal } = await supabaseAdmin
      .from("v_seller_available_balance" as any)
      .select("available_cents, eligible_orders")
      .eq("seller_id", userId)
      .maybeSingle();

    // Pending (held) = paid orders without payout_eligible_at yet, minus refunds
    const { data: pending } = await supabaseAdmin
      .from("orders")
      .select("seller_payout_amount, payout_eligible_at, refunded_amount, payout_paid_amount_cents")
      .eq("seller_id", userId)
      .eq("payment_status", "paid")
      .is("payout_paid_at", null);

    let pendingCents = 0;
    for (const o of pending ?? []) {
      const refunded = Number(o.refunded_amount ?? 0);
      const eligibleAt = o.payout_eligible_at ? new Date(o.payout_eligible_at as string) : null;
      const isPending = !eligibleAt || eligibleAt.getTime() > Date.now();
      if (!isPending || refunded > 0) continue;
      const owed = Math.max(0, Math.round(Number(o.seller_payout_amount ?? 0) * 100) - (o.payout_paid_amount_cents ?? 0));
      pendingCents += owed;
    }

    const { data: holds } = await supabaseAdmin
      .from("account_holds").select("id, reason").eq("user_id", userId).eq("status", "active");

    return {
      availableCents: Number((bal as any)?.available_cents ?? 0),
      pendingCents,
      eligibleOrders: Number((bal as any)?.eligible_orders ?? 0),
      activeHolds: holds ?? [],
    };
  });

export const requestPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ amountCents: z.number().int().min(100) }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    // DB trigger assert_payout_within_available_balance will throw if invalid
    const { data: row, error } = await supabaseAdmin
      .from("payout_requests")
      .insert({ user_id: userId, amount_cents: data.amountCents, status: "requested" } as any)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { payoutRequestId: row.id };
  });

// Admin-only: manually release payout eligibility for an order
export const adminReleasePayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orderId: z.string().uuid(), reason: z.string().min(3).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: role } = await supabaseAdmin.rpc("has_role" as any, { _user_id: userId, _role: "admin" });
    const { data: ownerRole } = await supabaseAdmin.rpc("has_role" as any, { _user_id: userId, _role: "owner" });
    if (!role && !ownerRole) throw new Error("Admin only");

    const { error } = await supabaseAdmin
      .from("orders")
      .update({ payout_eligible_at: new Date().toISOString() } as any)
      .eq("id", data.orderId);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("admin_action_log" as any).insert({
      admin_id: userId,
      action: "release_payout",
      target_id: data.orderId,
      notes: data.reason,
    } as any).then(() => null, () => null);

    await supabaseAdmin.from("shipment_events").insert({
      order_id: data.orderId,
      source: "admin_manual_release",
      message: `Payout released by admin: ${data.reason}`,
    } as any);

    return { ok: true };
  });

export const getSellerShippingAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data } = await supabaseAdmin
      .from("mv_seller_shipping_analytics" as any)
      .select("*")
      .eq("seller_id", userId)
      .maybeSingle();
    return { analytics: data ?? null };
  });
