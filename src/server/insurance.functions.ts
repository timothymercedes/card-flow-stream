// Shipping insurance server functions: quote, attach, claim, admin review.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getDefaultProvider, getInsuranceProvider } from "./insurance/index";

// ---------- Quote ----------
export const quoteInsurance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      orderId: z.string().uuid().optional(),
      coverageCents: z.number().int().min(100).max(2_000_000).optional(),
      providerCode: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    let coverage = data.coverageCents ?? 0;
    if (!coverage && data.orderId) {
      const { data: order } = await supabaseAdmin
        .from("orders").select("amount").eq("id", data.orderId).single();
      coverage = Math.round(Number(order?.amount ?? 0) * 100);
    }
    if (!coverage) throw new Error("Coverage amount required");
    const provider = data.providerCode
      ? getInsuranceProvider(data.providerCode)
      : getDefaultProvider();
    if (!provider.isActive) throw new Error(`${provider.code} is not enabled`);
    return provider.quote({ coverageCents: coverage });
  });

// ---------- Attach at checkout (buyer opt-in) ----------
export const attachInsuranceAtCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      orderId: z.string().uuid(),
      optIn: z.boolean(),
      coverageCents: z.number().int().min(100).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: order } = await supabaseAdmin
      .from("orders").select("id, buyer_id, seller_id, amount, insurance_status").eq("id", data.orderId).single();
    if (!order) throw new Error("Order not found");
    if (order.buyer_id !== userId) throw new Error("Only buyer can change insurance at checkout");
    if ((order as any).insurance_status === "active") throw new Error("Insurance already active");

    if (!data.optIn) {
      await supabaseAdmin.from("orders").update({
        insurance_status: "none", insurance_fee_cents: 0, insurance_coverage_cents: 0,
      } as any).eq("id", data.orderId);
      return { ok: true, status: "none" };
    }

    const coverage = data.coverageCents ?? Math.round(Number(order.amount) * 100);
    const provider = getDefaultProvider();
    const quote = await provider.quote({ coverageCents: coverage });

    await supabaseAdmin.from("orders").update({
      insurance_status: "requested",
      insurance_provider: provider.code,
      insurance_coverage_cents: coverage,
      insurance_fee_cents: quote.feeCents,
      insurance_paid_by: "buyer",
      insurance_added_post_purchase: false,
    } as any).eq("id", data.orderId);

    return { ok: true, status: "requested", feeCents: quote.feeCents, coverageCents: coverage };
  });

// ---------- Seller adds insurance after purchase (seller pays) ----------
export const sellerAddInsurance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      orderId: z.string().uuid(),
      coverageCents: z.number().int().min(100).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: order } = await supabaseAdmin
      .from("orders").select("id, seller_id, amount, insurance_status, label_url").eq("id", data.orderId).single();
    if (!order) throw new Error("Order not found");
    if (order.seller_id !== userId) throw new Error("Only seller can add insurance");
    if ((order as any).label_url) throw new Error("Cannot add insurance after label was purchased");
    if ((order as any).insurance_status === "active") throw new Error("Insurance already active");

    const coverage = data.coverageCents ?? Math.round(Number(order.amount) * 100);
    const provider = getDefaultProvider();
    const quote = await provider.quote({ coverageCents: coverage });

    await supabaseAdmin.from("orders").update({
      insurance_status: "active",
      insurance_provider: provider.code,
      insurance_coverage_cents: coverage,
      insurance_fee_cents: quote.feeCents,
      insurance_paid_by: "seller",
      insurance_added_post_purchase: true,
      insurance_purchased_at: new Date().toISOString(),
    } as any).eq("id", data.orderId);

    // Deduct from seller payout via adjustment
    await supabaseAdmin.from("payout_adjustments" as any).insert({
      seller_id: userId,
      order_id: data.orderId,
      amount_cents: -quote.feeCents,
      kind: "insurance_fee",
      notes: `Seller-added insurance via ${provider.code}`,
    });

    return { ok: true, feeCents: quote.feeCents, coverageCents: coverage };
  });

// ---------- Get insurance summary for an order ----------
export const getOrderInsurance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, buyer_id, seller_id, amount, insurance_status, insurance_provider, insurance_coverage_cents, insurance_fee_cents, insurance_paid_by, insurance_added_post_purchase, insurance_purchased_at, insurance_provider_ref")
      .eq("id", data.orderId).single();
    if (!order) throw new Error("Order not found");
    if (order.buyer_id !== userId && order.seller_id !== userId) {
      throw new Error("Forbidden");
    }
    const { data: claims } = await supabaseAdmin
      .from("insurance_claims" as any)
      .select("id, reason, status, claim_amount_cents, reimbursed_cents, created_at, decided_at, admin_notes")
      .eq("order_id", data.orderId)
      .order("created_at", { ascending: false });
    return { order, claims: claims ?? [] };
  });

// ---------- Submit a claim ----------
export const submitClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      orderId: z.string().uuid(),
      reason: z.enum(["lost", "damaged", "stolen"]),
      amountCents: z.number().int().min(100),
      description: z.string().max(2000).optional(),
      evidence: z.array(z.object({
        filePath: z.string().min(1).max(500),
        kind: z.enum(["photo", "tracking", "document", "other"]).default("photo"),
        notes: z.string().max(500).optional(),
      })).max(20).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: order } = await supabaseAdmin
      .from("orders").select("id, seller_id, insurance_status, insurance_provider, insurance_coverage_cents")
      .eq("id", data.orderId).single();
    if (!order) throw new Error("Order not found");
    if (order.seller_id !== userId) throw new Error("Only seller can file a claim");
    if (!["active", "requested"].includes((order as any).insurance_status)) {
      throw new Error("This order is not insured");
    }
    if (data.amountCents > Number((order as any).insurance_coverage_cents || 0)) {
      throw new Error("Claim exceeds coverage");
    }

    const providerCode = (order as any).insurance_provider || "shippo";
    const provider = getInsuranceProvider(providerCode);
    const { providerClaimRef } = await provider.fileClaim({
      orderId: data.orderId,
      reason: data.reason,
      amountCents: data.amountCents,
      description: data.description,
    });

    const { data: claim, error } = await supabaseAdmin
      .from("insurance_claims" as any)
      .insert({
        order_id: data.orderId,
        claimant_user_id: userId,
        reason: data.reason,
        claim_amount_cents: data.amountCents,
        description: data.description,
        status: "submitted",
        provider_code: providerCode,
        provider_claim_ref: providerClaimRef,
      })
      .select("id")
      .single();
    if (error || !claim) throw new Error(error?.message || "Failed to create claim");

    if (data.evidence?.length) {
      await supabaseAdmin.from("insurance_claim_evidence" as any).insert(
        data.evidence.map((e) => ({
          claim_id: (claim as any).id,
          uploaded_by: userId,
          file_path: e.filePath,
          kind: e.kind,
          notes: e.notes,
        })),
      );
    }

    return { ok: true, claimId: (claim as any).id };
  });

// ---------- Admin: list claims ----------
async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Admin only");
}

export const adminListClaims = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      status: z.enum(["submitted", "under_review", "approved", "denied", "paid", "all"]).default("submitted"),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    let q = supabaseAdmin
      .from("insurance_claims" as any)
      .select("id, order_id, claimant_user_id, reason, status, claim_amount_cents, reimbursed_cents, created_at, provider_code, admin_notes")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: claims } = await q;

    // Per-claimant counts in last 90d (for fraud signals)
    const ids = Array.from(new Set((claims ?? []).map((c: any) => c.claimant_user_id)));
    let counts: Record<string, number> = {};
    if (ids.length) {
      const { data: recent } = await supabaseAdmin
        .from("insurance_claims" as any)
        .select("claimant_user_id")
        .in("claimant_user_id", ids)
        .gte("created_at", new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString());
      for (const r of (recent ?? []) as any[]) {
        counts[r.claimant_user_id] = (counts[r.claimant_user_id] || 0) + 1;
      }
    }
    return { claims: claims ?? [], recentCountsBySeller: counts };
  });

export const adminDecideClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      claimId: z.string().uuid(),
      decision: z.enum(["approved", "denied", "paid", "under_review"]),
      notes: z.string().max(2000).optional(),
      reimbursedCents: z.number().int().min(0).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const update: any = {
      status: data.decision,
      admin_notes: data.notes ?? null,
      decided_by: context.userId,
      decided_at: new Date().toISOString(),
    };
    if (data.decision === "paid" || data.decision === "approved") {
      update.reimbursed_cents = data.reimbursedCents ?? 0;
      if (data.decision === "paid") update.reimbursed_at = new Date().toISOString();
    }
    const { error } = await supabaseAdmin
      .from("insurance_claims" as any).update(update).eq("id", data.claimId);
    if (error) throw new Error(error.message);

    // Auto-flag sellers with 3+ approved/paid claims in 90d
    if (["approved", "paid"].includes(data.decision)) {
      const { data: claim } = await supabaseAdmin
        .from("insurance_claims" as any).select("claimant_user_id").eq("id", data.claimId).single();
      if (claim) {
        const { data: prior } = await supabaseAdmin
          .from("insurance_claims" as any)
          .select("id")
          .eq("claimant_user_id", (claim as any).claimant_user_id)
          .in("status", ["approved", "paid"])
          .gte("created_at", new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString());
        if ((prior ?? []).length >= 3) {
          await supabaseAdmin.from("fraud_flags" as any).insert({
            user_id: (claim as any).claimant_user_id,
            kind: "frequent_insurance_claims",
            severity: "medium",
            details: { count_90d: (prior ?? []).length },
          });
        }
      }
    }

    return { ok: true };
  });

// ---------- Signed URL for evidence file (read) ----------
export const getEvidenceSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ filePath: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    // Verify user can see the file (admin OR owner of the claim)
    const { data: row } = await supabaseAdmin
      .from("insurance_claim_evidence" as any)
      .select("uploaded_by, claim:insurance_claims(claimant_user_id)")
      .eq("file_path", data.filePath)
      .maybeSingle();
    const isAdmin = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    const canRead =
      !!isAdmin.data ||
      (row as any)?.uploaded_by === context.userId ||
      (row as any)?.claim?.claimant_user_id === context.userId;
    if (!canRead) throw new Error("Forbidden");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("insurance-evidence").createSignedUrl(data.filePath, 60 * 10);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });
