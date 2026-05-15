import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getStripe } from "@/lib/stripe.server";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = ((data ?? []) as any[]).map((r) => r.role);
  if (!roles.includes("admin") && !roles.includes("owner")) throw new Error("forbidden");
}

export const getPlatformRevenueSummaryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ sinceDays: z.number().int().min(0).max(3650).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const since = data.sinceDays
      ? new Date(Date.now() - data.sinceDays * 86400000).toISOString()
      : null;

    const { data: rows, error } = await supabase.rpc("admin_revenue_summary" as any, { _since: since });
    if (error) throw new Error(error.message);

    const byKind: Record<string, { total_cents: number; count: number }> = {};
    let grossCents = 0;
    let lossesCents = 0;
    for (const r of (rows ?? []) as any[]) {
      const cents = Number(r.total_cents || 0);
      byKind[r.kind] = { total_cents: cents, count: Number(r.count || 0) };
      if (cents >= 0) grossCents += cents; else lossesCents += cents;
    }
    const netCents = grossCents + lossesCents;

    // Stripe balance (platform account)
    let balance: { available_cents: number; pending_cents: number; currency: string } | null = null;
    try {
      const stripe = getStripe();
      const b = await stripe.balance.retrieve();
      const avail = (b.available || []).find((x: any) => x.currency === "usd") || (b.available || [])[0];
      const pend = (b.pending || []).find((x: any) => x.currency === "usd") || (b.pending || [])[0];
      balance = {
        available_cents: avail?.amount ?? 0,
        pending_cents: pend?.amount ?? 0,
        currency: (avail?.currency || pend?.currency || "usd").toUpperCase(),
      };
    } catch (e) {
      console.error("stripe balance retrieve failed", e);
    }

    let payoutsPaidCents = 0;
    let payoutsCount = 0;
    try {
      const stripe = getStripe();
      const payouts = await stripe.payouts.list({ limit: 100 });
      for (const p of payouts.data) {
        if (p.status === "paid") {
          payoutsPaidCents += p.amount;
          payoutsCount += 1;
        }
      }
    } catch (e) { console.error("stripe payouts list failed", e); }

    return {
      byKind,
      grossCents,
      lossesCents,
      netCents,
      balance,
      payouts: { paid_cents: payoutsPaidCents, count: payoutsCount },
    };
  });

export const listPlatformRevenueFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      limit: z.number().int().min(1).max(500).optional(),
      offset: z.number().int().min(0).max(100000).optional(),
      kind: z.string().max(64).optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: rows, error } = await supabase.rpc("admin_list_platform_revenue" as any, {
      _limit: data.limit ?? 100,
      _offset: data.offset ?? 0,
      _kind: data.kind ?? null,
    });
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });
