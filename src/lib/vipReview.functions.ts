import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Seller: this week's paid commission progress + VIP snapshots for weeks still under review. */
export const getMyWeeklyCommission = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { openReviewWeeks, refreshSellerWeeks } = await import("./vipReview.server");
    const { sellerPriorWeekSalesCents } = await import("./feePolicy.server");
    const { easternWeekStart } = await import("./feePolicy");
    const week = easternWeekStart(new Date());
    const { data: tracker } = await supabaseAdmin.from("seller_weekly_sales_tracker")
      .select("cumulative_sales_cents").eq("seller_id", context.userId).eq("week_start", week.toISOString()).maybeSingle();
    const paidThisWeekCents = tracker ? Number(tracker.cumulative_sales_cents) : await sellerPriorWeekSalesCents(supabaseAdmin, context.userId);
    const reviews = await refreshSellerWeeks(supabaseAdmin, context.userId, openReviewWeeks());
    const { data: adjustments } = await supabaseAdmin.from("seller_commission_adjustments")
      .select("id,adjustment_type,amount_cents,reason,created_at").eq("seller_id", context.userId)
      .order("created_at", { ascending: false }).limit(20);
    return { weekStart: week.toISOString(), paidThisWeekCents, reviews, adjustments: adjustments ?? [] };
  });

/** Admin: recalculate recent weeks for active sellers and list VIP reviews. */
export const adminListVipReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ recalc: z.boolean().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assertStaff, openReviewWeeks, refreshSellerWeeks } = await import("./vipReview.server");
    await assertStaff(supabaseAdmin, context.userId);
    const weeks = openReviewWeeks();
    if (data.recalc) {
      const since = weeks[weeks.length - 1].toISOString();
      const { data: rows } = await supabaseAdmin.from("orders").select("seller_id")
        .eq("payment_status", "paid").gte("paid_at", since).limit(5000);
      const sellers = Array.from(new Set((rows ?? []).map((r: any) => r.seller_id).filter(Boolean))).slice(0, 300);
      for (const s of sellers) await refreshSellerWeeks(supabaseAdmin, s as string, weeks);
    }
    const { data: reviews, error } = await supabaseAdmin.from("seller_weekly_vip_reviews").select("*")
      .order("week_start", { ascending: false }).order("eligible_vip_sales_cents", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((reviews ?? []).map((r: any) => r.seller_id)));
    const [{ data: profiles }, { data: trust }, { data: disputes }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id,username,shop_name").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
      supabaseAdmin.from("seller_trust").select("*").in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
      supabaseAdmin.from("disputes").select("reported_user_id,lifecycle_status").in("reported_user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
    ]);
    const byId = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const trustBy = new Map((trust ?? []).map((t: any) => [t.user_id, t]));
    return (reviews ?? []).map((r: any) => {
      const ds = (disputes ?? []).filter((d: any) => d.reported_user_id === r.seller_id);
      return {
        ...r,
        seller: byId.get(r.seller_id) ?? null,
        trust: trustBy.get(r.seller_id) ?? null,
        disputeHistory: { total: ds.length, refunded: ds.filter((d: any) => String(d.lifecycle_status).startsWith("resolved_")).length },
      };
    });
  });

export const adminDecideVipReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    reviewId: z.string().uuid(), action: z.enum(["approve", "reject", "reopen"]), reason: z.string().trim().min(3).max(1000),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assertStaff } = await import("./vipReview.server");
    await assertStaff(supabaseAdmin, context.userId);
    const { data: row, error } = await supabaseAdmin.rpc("decide_seller_vip_review", {
      _review_id: data.reviewId, _admin_id: context.userId, _action: data.action, _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { status: (row as any)?.status as string };
  });

export const adminRecordCommissionAdjustment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    sellerId: z.string().uuid(), type: z.enum(["manual_credit", "manual_debit", "dispute_reconsideration"]),
    amountCents: z.number().int().positive().max(100_000_000), reason: z.string().trim().min(3).max(1000),
    orderId: z.string().uuid().optional(), reviewId: z.string().uuid().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assertStaff } = await import("./vipReview.server");
    await assertStaff(supabaseAdmin, context.userId);
    const { data: id, error } = await supabaseAdmin.rpc("record_seller_commission_adjustment", {
      _admin_id: context.userId, _seller_id: data.sellerId, _type: data.type, _amount_cents: data.amountCents,
      _reason: data.reason, _order_id: data.orderId ?? null, _review_id: data.reviewId ?? null,
    } as any);
    if (error) throw new Error(error.message);
    return { id: id as string };
  });
