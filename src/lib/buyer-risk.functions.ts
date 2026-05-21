/**
 * Buyer risk monitoring server functions (Phase 11).
 *
 * Provides:
 *  - admin queue of flagged buyers (from buyer_review_queue)
 *  - detail view (30-day signals, recent orders, restrictions, disputes)
 *  - apply / clear restrictions
 *  - clear review entry
 *
 * Also exposes a buyer-facing "do I have any active restrictions" read.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "owner"]);
  if (!data || data.length === 0) throw new Error("forbidden");
}

export const getBuyerRiskQueueFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const { data: queue } = await supabaseAdmin
      .from("buyer_review_queue")
      .select("id, buyer_id, reason, unpaid_strikes, status, created_at")
      .eq("status", "pending")
      .order("unpaid_strikes", { ascending: false })
      .limit(200);

    const buyerIds = Array.from(new Set(((queue ?? []) as any[]).map((r) => r.buyer_id)));
    if (buyerIds.length === 0) return { rows: [] };

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, username, avatar_url, created_at")
      .in("id", buyerIds);

    const pmap = new Map<string, any>(
      ((profiles ?? []) as any[]).map((p) => [p.id, p]),
    );

    return {
      rows: ((queue ?? []) as any[]).map((q) => ({
        ...q,
        profile: pmap.get(q.buyer_id) ?? null,
      })),
    };
  });

export const getBuyerRiskDetailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

    const [profile, signals, restrictions, recentOrders, disputes] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, username, avatar_url, created_at, address_country, buyer_verified")
        .eq("id", data.userId)
        .maybeSingle(),
      supabaseAdmin
        .from("buyer_risk_signals")
        .select("id, kind, severity_weight, ref_table, ref_id, seller_id, metadata, created_at")
        .eq("user_id", data.userId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("buyer_restrictions")
        .select("*")
        .eq("user_id", data.userId)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("orders")
        .select("id, title, amount, status, payment_status, seller_id, created_at")
        .eq("buyer_id", data.userId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabaseAdmin
        .from("disputes")
        .select("id, reason, status, amount_cents, created_at")
        .eq("reporter_id", data.userId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const signalRows = (signals.data ?? []) as any[];
    const score = signalRows.reduce((a, r) => a + (r.severity_weight ?? 1), 0);
    const breakdown: Record<string, number> = {};
    for (const r of signalRows) breakdown[r.kind] = (breakdown[r.kind] ?? 0) + 1;
    const affectedSellers = Array.from(
      new Set(signalRows.map((r) => r.seller_id).filter(Boolean)),
    );

    return {
      profile: profile.data,
      score,
      breakdown,
      signals: signalRows,
      restrictions: (restrictions.data ?? []) as any[],
      recentOrders: (recentOrders.data ?? []) as any[],
      disputes: (disputes.data ?? []) as any[],
      affectedSellers,
    };
  });

const ApplyInput = z.object({
  userId: z.string().uuid(),
  kind: z.enum(["purchase_block", "bid_limit", "require_verification", "frozen"]),
  reason: z.string().min(3).max(500),
  centsLimit: z.number().int().min(0).max(10_000_000).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

export const applyBuyerRestrictionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ApplyInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { data: row, error } = await supabaseAdmin
      .from("buyer_restrictions")
      .insert({
        user_id: data.userId,
        kind: data.kind,
        cents_limit: data.centsLimit ?? null,
        reason: data.reason,
        created_by: context.userId,
        expires_at: data.expiresAt ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { restriction: row };
  });

export const clearBuyerRestrictionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ restrictionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { error } = await supabaseAdmin
      .from("buyer_restrictions")
      .update({
        active: false,
        cleared_at: new Date().toISOString(),
        cleared_by: context.userId,
      })
      .eq("id", data.restrictionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const clearBuyerReviewFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      reviewId: z.string().uuid(),
      resolution: z.enum(["waived", "restored", "banned"]).default("waived"),
      notes: z.string().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { error } = await supabaseAdmin
      .from("buyer_review_queue")
      .update({
        status: data.resolution,
        resolved_by: context.userId,
        resolution_notes: data.notes ?? null,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", data.reviewId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Buyer-facing: list my own active restrictions (for showing a banner). */
export const getMyRestrictionsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("buyer_restrictions")
      .select("id, kind, cents_limit, reason, expires_at, created_at")
      .eq("user_id", context.userId)
      .eq("active", true);
    const now = Date.now();
    return {
      restrictions: ((data ?? []) as any[]).filter(
        (r) => !r.expires_at || new Date(r.expires_at).getTime() > now,
      ),
    };
  });
