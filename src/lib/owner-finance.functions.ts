import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertOwner(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = ((data ?? []) as any[]).map((r) => r.role);
  if (!roles.includes("owner")) throw new Error("forbidden: owner role required");
}

const RangeSchema = z.object({
  sinceDays: z.number().int().min(0).max(3650).optional(),
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
});
type RangeInput = z.infer<typeof RangeSchema>;

function resolveRange(r: RangeInput) {
  const since = r.since
    ? r.since
    : r.sinceDays
    ? new Date(Date.now() - r.sinceDays * 86400000).toISOString()
    : null;
  const until = r.until ?? null;
  return { since, until };
}

// ---- Overview ---------------------------------------------------------------
export const getOwnerFinanceOverviewFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => RangeSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOwner(supabase, userId);
    const { since, until } = resolveRange(data);

    const [revSummary, platformBalance, shipping, personal] = await Promise.all([
      supabase.rpc("admin_revenue_summary" as any, { _since: since }),
      supabase.rpc("compute_platform_available" as any),
      supabase.rpc("admin_shipping_margin" as any, { _since: since, _until: until }),
      supabase.rpc("admin_personal_sales_summary" as any, { _since: since, _until: until }),
    ]);

    if (revSummary.error) throw new Error(revSummary.error.message);
    if (platformBalance.error) throw new Error(platformBalance.error.message);
    if (shipping.error) throw new Error(shipping.error.message);
    if (personal.error) throw new Error(personal.error.message);

    const byKind: Record<string, { total_cents: number; count: number }> = {};
    let grossCents = 0;
    let lossesCents = 0;
    for (const r of (revSummary.data ?? []) as any[]) {
      const cents = Number(r.total_cents || 0);
      byKind[r.kind] = { total_cents: cents, count: Number(r.count || 0) };
      if (cents >= 0) grossCents += cents;
      else lossesCents += cents;
    }

    const plat = Array.isArray(platformBalance.data) ? platformBalance.data[0] : platformBalance.data;
    const ship = Array.isArray(shipping.data) ? shipping.data[0] : shipping.data;
    const pers = Array.isArray(personal.data) ? personal.data[0] : personal.data;

    return {
      byKind,
      grossCents,
      lossesCents,
      netCents: grossCents + lossesCents,
      platform: {
        netEarningsCents: Number(plat?.net_earnings_cents ?? 0),
        pendingPayoutsCents: Number(plat?.payouts_pending_cents ?? 0),
        completedPayoutsCents: Number(plat?.payouts_completed_cents ?? 0),
        availableCents: Number(plat?.available_cents ?? 0),
      },
      shipping: {
        chargedCents: Number(ship?.shipping_charged_cents ?? 0),
        adjFeesCents: Number(ship?.adjustment_fees_cents ?? 0),
        adjLossesCents: Number(ship?.adjustment_losses_cents ?? 0),
        netMarginCents: Number(ship?.net_shipping_margin_cents ?? 0),
      },
      personal: {
        orderCount: Number(pers?.order_count ?? 0),
        grossSalesCents: Number(pers?.gross_sales_cents ?? 0),
        commissionPaidCents: Number(pers?.commission_paid_cents ?? 0),
        netPayoutCents: Number(pers?.net_payout_cents ?? 0),
        refundedCents: Number(pers?.refunded_cents ?? 0),
      },
    };
  });

// ---- Revenue by period (trend) ---------------------------------------------
export const getRevenueByPeriodFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    RangeSchema.extend({ bucket: z.enum(["day", "week", "month", "year"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOwner(supabase, userId);
    const { since, until } = resolveRange(data);
    const { data: rows, error } = await supabase.rpc("admin_revenue_by_period" as any, {
      _bucket: data.bucket,
      _since: since,
      _until: until,
    });
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as any[] };
  });

// ---- Revenue by stream ------------------------------------------------------
export const getRevenueByStreamFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => RangeSchema.extend({ limit: z.number().int().min(1).max(200).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOwner(supabase, userId);
    const { since, until } = resolveRange(data);
    const { data: rows, error } = await supabase.rpc("admin_revenue_by_stream" as any, {
      _since: since,
      _until: until,
      _limit: data.limit ?? 50,
    });
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as any[] };
  });

// ---- Revenue by seller ------------------------------------------------------
export const getRevenueBySellerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => RangeSchema.extend({ limit: z.number().int().min(1).max(200).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOwner(supabase, userId);
    const { since, until } = resolveRange(data);
    const { data: rows, error } = await supabase.rpc("admin_revenue_by_seller" as any, {
      _since: since,
      _until: until,
      _limit: data.limit ?? 50,
    });
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as any[] };
  });

// ---- Owner's personal orders -----------------------------------------------
export const getOwnerPersonalOrdersFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => RangeSchema.extend({ limit: z.number().int().min(1).max(200).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOwner(supabase, userId);
    const { since, until } = resolveRange(data);
    let q = supabase
      .from("orders")
      .select("id,title,amount,commission_amount,seller_payout_amount,shipping_amount,payment_status,status,stream_id,created_at,buyer_id")
      .eq("seller_id", userId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (since) q = q.gte("created_at", since);
    if (until) q = q.lt("created_at", until);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as any[] };
  });

// ---- Platform payouts -------------------------------------------------------
export const listPlatformPayoutsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ limit: z.number().int().min(1).max(200).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOwner(supabase, userId);
    const { data: rows, error } = await supabase
      .from("platform_payouts" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as any[] };
  });

export const requestPlatformPayoutFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      amountCents: z.number().int().positive().max(10_000_000_00),
      destination: z.enum(["platform_bank", "owner_personal"]),
      notes: z.string().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOwner(supabase, userId);
    const { data: row, error } = await supabase.rpc("request_platform_payout" as any, {
      _amount_cents: data.amountCents,
      _destination: data.destination,
      _notes: data.notes ?? null,
    });
    if (error) throw new Error(error.message);
    return row;
  });

// ---- Owner's personal seller payouts (filter of payout_requests) ----------
export const listOwnerPersonalPayoutsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ limit: z.number().int().min(1).max(200).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOwner(supabase, userId);
    const { data: rows, error } = await supabase
      .from("payout_requests")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as any[] };
  });
