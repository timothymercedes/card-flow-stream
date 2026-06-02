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

// Seller trust profile — drives instant-payout percentage and freeze state.
export const getSellerTrustFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data } = await supabaseAdmin
      .from("seller_trust" as any)
      .select("completed_deliveries, tier, instant_release_pct, manual_override_pct, frozen")
      .eq("user_id", userId)
      .maybeSingle();
    return {
      completed_deliveries: Number((data as any)?.completed_deliveries ?? 0),
      tier: ((data as any)?.tier ?? "new") as string,
      instant_release_pct: Number((data as any)?.instant_release_pct ?? 0),
      manual_override_pct:
        (data as any)?.manual_override_pct == null ? null : Number((data as any).manual_override_pct),
      frozen: !!(data as any)?.frozen,
    };
  });

// Full payable breakdown for a seller, netting locks / in-flight payouts / holds.
export const getSellerPayableFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;

    const [{ data: bal }, { data: trust }, { data: locks }, { data: inflight }, { data: hold }, { data: pendingRows }] =
      await Promise.all([
        supabaseAdmin
          .from("v_seller_available_balance" as any)
          .select("available_cents")
          .eq("seller_id", userId)
          .maybeSingle(),
        supabaseAdmin
          .from("seller_trust" as any)
          .select("tier, instant_release_pct, manual_override_pct, frozen")
          .eq("user_id", userId)
          .maybeSingle(),
        supabaseAdmin
          .from("payout_locks" as any)
          .select("amount_cents")
          .eq("user_id", userId)
          .is("released_at", null),
        supabaseAdmin
          .from("payout_requests" as any)
          .select("amount_cents, status")
          .eq("user_id", userId)
          .in("status", ["requested", "processing"]),
        supabaseAdmin
          .from("account_holds" as any)
          .select("balance_owed_cents")
          .eq("user_id", userId)
          .eq("status", "active")
          .maybeSingle(),
        supabaseAdmin
          .from("orders")
          .select("seller_payout_amount, payout_eligible_at, refunded_amount, payout_paid_amount_cents")
          .eq("seller_id", userId)
          .eq("payment_status", "paid")
          .is("payout_paid_at", null),
      ]);

    const available_cents = Number((bal as any)?.available_cents ?? 0);

    let pending_cents = 0;
    for (const o of (pendingRows as any[]) ?? []) {
      const refunded = Number(o.refunded_amount ?? 0);
      const eligibleAt = o.payout_eligible_at ? new Date(o.payout_eligible_at as string) : null;
      const isPending = !eligibleAt || eligibleAt.getTime() > Date.now();
      if (!isPending || refunded > 0) continue;
      const owed = Math.max(
        0,
        Math.round(Number(o.seller_payout_amount ?? 0) * 100) - (o.payout_paid_amount_cents ?? 0),
      );
      pending_cents += owed;
    }

    const locked_cents = ((locks as any[]) ?? []).reduce((s, l) => s + Number(l.amount_cents ?? 0), 0);
    const in_flight_cents = ((inflight as any[]) ?? []).reduce((s, p) => s + Number(p.amount_cents ?? 0), 0);
    const owed_cents = Number((hold as any)?.balance_owed_cents ?? 0);

    const frozen = !!(trust as any)?.frozen;
    const instant_pct =
      (trust as any)?.manual_override_pct == null
        ? Number((trust as any)?.instant_release_pct ?? 0)
        : Number((trust as any).manual_override_pct);

    const payable_cents = frozen
      ? 0
      : Math.max(0, available_cents - locked_cents - in_flight_cents - owed_cents);

    return {
      available_cents,
      pending_cents,
      locked_cents,
      in_flight_cents,
      owed_cents,
      payable_cents,
      instant_pct,
      tier: ((trust as any)?.tier ?? "new") as string,
      frozen,
    };
  });

// Alias kept in sync with the component import name.
export const requestPayoutFn = requestPayout;

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
