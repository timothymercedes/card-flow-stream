/**
 * Admin Moderation & Audit History server functions.
 *
 * - User dossier (profile + store + counts + restrictions + risk)
 * - Account audit timeline (merged from account_audit_log)
 * - Moderation reports queue + actions
 * - Dispute lifecycle + reconciliation
 * - Evidence vault (review / lock / flag) + signed URLs
 * - Admin notes
 *
 * Every mutation writes to admin_action_log (tamper-evident) and emits an
 * account_audit_log event via the log_account_event RPC.
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
    .in("role", ["admin", "owner", "moderator"]);
  if (!data || data.length === 0) throw new Error("forbidden");
}

async function logAdmin(args: {
  admin: string;
  action: string;
  table?: string;
  id?: string;
  subjectUserId?: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
}) {
  await (supabaseAdmin.from("admin_action_log") as any).insert({
    admin_id: args.admin,
    action: args.action,
    target_table: args.table ?? null,
    target_id: args.id ?? null,
    subject_user_id: args.subjectUserId ?? null,
    before_state: args.before ?? null,
    after_state: args.after ?? null,
    reason: args.reason ?? null,
  });
}

async function logEvent(args: {
  subjectUserId: string;
  eventType: string;
  summary: string;
  severity?: "info" | "low" | "medium" | "high" | "critical";
  details?: Record<string, unknown>;
  actorUserId?: string | null;
  orderId?: string | null;
  streamId?: string | null;
  disputeId?: string | null;
  reportId?: string | null;
  evidenceId?: string | null;
  payoutId?: string | null;
}) {
  await (supabaseAdmin as any).rpc("log_account_event", {
    _subject_user_id: args.subjectUserId,
    _event_type: args.eventType,
    _summary: args.summary,
    _severity: args.severity ?? "info",
    _details: args.details ?? {},
    _actor_user_id: args.actorUserId ?? null,
    _order_id: args.orderId ?? null,
    _stream_id: args.streamId ?? null,
    _payment_intent_id: null,
    _dispute_id: args.disputeId ?? null,
    _payout_id: args.payoutId ?? null,
    _report_id: args.reportId ?? null,
    _evidence_id: args.evidenceId ?? null,
  });
}


// ============================================================
// USER DOSSIER + TIMELINE
// ============================================================

export const getUserDossierFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const uid = data.userId;

    const [profile, roles, storeHistory, usernameHistory, restrictions, riskScore, counts] =
      await Promise.all([
        supabaseAdmin.from("profiles").select("*").eq("id", uid).maybeSingle(),
        supabaseAdmin.from("user_roles").select("role").eq("user_id", uid),
        supabaseAdmin
          .from("store_name_history")
          .select("old_name, new_name, changed_at, changed_by")
          .eq("seller_id", uid)
          .order("changed_at", { ascending: false }),
        supabaseAdmin
          .from("username_history")
          .select("old_username, new_username, changed_at")
          .eq("user_id", uid)
          .order("changed_at", { ascending: false }),
        supabaseAdmin
          .from("buyer_restrictions")
          .select("*")
          .eq("user_id", uid)
          .order("created_at", { ascending: false }),
        supabaseAdmin
          .from("buyer_review_queue")
          .select("*")
          .eq("buyer_id", uid)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),

        Promise.all([
          supabaseAdmin
            .from("orders")
            .select("id", { count: "exact", head: true })
            .or(`buyer_id.eq.${uid},seller_id.eq.${uid}`),
          supabaseAdmin
            .from("disputes")
            .select("id", { count: "exact", head: true })
            .or(`reporter_id.eq.${uid},reported_user_id.eq.${uid}`),
          supabaseAdmin
            .from("moderation_reports")
            .select("id", { count: "exact", head: true })
            .eq("subject_user_id", uid),
          supabaseAdmin
            .from("payout_requests")
            .select("id", { count: "exact", head: true })
            .eq("user_id", uid),
        ]),
      ]);

    return {
      profile: profile.data,
      roles: (roles.data ?? []).map((r: any) => r.role),
      storeHistory: storeHistory.data ?? [],
      usernameHistory: usernameHistory.data ?? [],
      restrictions: restrictions.data ?? [],
      riskScore: riskScore.data ?? null,
      counts: {
        orders: counts[0].count ?? 0,
        disputes: counts[1].count ?? 0,
        reports: counts[2].count ?? 0,
        payouts: counts[3].count ?? 0,
      },
    };
  });

export const getUserAuditTimelineFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        userId: z.string().uuid(),
        eventTypes: z.array(z.string()).optional(),
        severity: z.string().optional(),
        limit: z.number().min(1).max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    let q = supabaseAdmin
      .from("account_audit_log")
      .select("*")
      .eq("subject_user_id", data.userId)
      .order("occurred_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (data.eventTypes?.length) q = q.in("event_type", data.eventTypes as any);
    if (data.severity) q = q.eq("severity", data.severity as any);
    const { data: rows } = await q;
    return { rows: rows ?? [] };
  });

export const searchUsersFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        q: z.string().min(1).max(100).optional(),
        riskTier: z.string().optional(),
        hasRestrictions: z.boolean().optional(),
        limit: z.number().min(1).max(100).default(50),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    let q = supabaseAdmin
      .from("profiles")
      .select("id, username, shop_name, avatar_url, is_seller, created_at, verification_status")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.q) q = q.or(`username.ilike.%${data.q}%,shop_name.ilike.%${data.q}%`);
    const { data: rows } = await q;
    return { rows: rows ?? [] };
  });

// ============================================================
// REPORTS
// ============================================================

export const listReportsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        status: z.enum(["open", "investigating", "resolved", "dismissed", "escalated"]).optional(),
        limit: z.number().min(1).max(200).default(100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    let q = supabaseAdmin
      .from("moderation_reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows } = await q;
    return { rows: rows ?? [] };
  });

export const updateReportStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        reportId: z.string().uuid(),
        status: z.enum(["open", "investigating", "resolved", "dismissed", "escalated"]),
        notes: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: before } = await supabaseAdmin
      .from("moderation_reports")
      .select("*")
      .eq("id", data.reportId)
      .maybeSingle();
    if (!before) throw new Error("not_found");

    const patch: Record<string, unknown> = { status: data.status };
    if (data.notes) patch.resolution_notes = data.notes;
    if (["resolved", "dismissed"].includes(data.status)) {
      patch.resolved_at = new Date().toISOString();
      patch.resolved_by = context.userId;
    }
    const { data: after } = await supabaseAdmin
      .from("moderation_reports")
      .update(patch)
      .eq("id", data.reportId)
      .select()
      .maybeSingle();

    await logAdmin({
      admin: context.userId,
      action: `report.${data.status}`,
      table: "moderation_reports",
      id: data.reportId,
      subjectUserId: (before as any).subject_user_id,
      before,
      after,
      reason: data.notes,
    });
    if ((before as any).subject_user_id) {
      await logEvent({
        subjectUserId: (before as any).subject_user_id,
        eventType: "admin_action",
        summary: `Report ${data.status}`,
        severity: data.status === "escalated" ? "high" : "medium",
        actorUserId: context.userId,
        reportId: data.reportId,
        details: { notes: data.notes },
      });
    }
    return { ok: true };
  });

// ============================================================
// DISPUTES
// ============================================================

export const listDisputesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        lifecycle: z.string().optional(),
        limit: z.number().min(1).max(200).default(100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    let q = supabaseAdmin
      .from("disputes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.lifecycle) q = q.eq("lifecycle_status", data.lifecycle as any);
    const { data: rows } = await q;
    return { rows: rows ?? [] };
  });

export const updateDisputeLifecycleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        disputeId: z.string().uuid(),
        lifecycle: z.enum([
          "opened",
          "evidence_pending",
          "under_review",
          "escalated",
          "resolved_refund",
          "resolved_rebook",
          "resolved_partial",
          "rejected",
          "closed",
        ]),
        notes: z.string().max(2000).optional(),
        rebookOrderId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: before } = await supabaseAdmin
      .from("disputes")
      .select("*")
      .eq("id", data.disputeId)
      .maybeSingle();
    if (!before) throw new Error("not_found");

    const patch: Record<string, unknown> = { lifecycle_status: data.lifecycle };
    if (data.notes) patch.reconciliation_notes = data.notes;
    if (data.rebookOrderId) patch.rebook_order_id = data.rebookOrderId;
    if (data.lifecycle === "escalated") {
      patch.escalated_at = new Date().toISOString();
      patch.escalated_by = context.userId;
    }
    if (data.lifecycle.startsWith("resolved")) {
      patch.reconciled_at = new Date().toISOString();
      patch.status = "resolved";
      patch.resolved_at = new Date().toISOString();
      patch.resolved_by = context.userId;
    }

    const { data: after } = await supabaseAdmin
      .from("disputes")
      .update(patch)
      .eq("id", data.disputeId)
      .select()
      .maybeSingle();

    await logAdmin({
      admin: context.userId,
      action: `dispute.${data.lifecycle}`,
      table: "disputes",
      id: data.disputeId,
      subjectUserId: (before as any).reported_user_id ?? (before as any).reporter_id,
      before,
      after,
      reason: data.notes,
    });

    // Notify buyer + seller
    const targets = [
      (before as any).reporter_id,
      (before as any).reported_user_id,
    ].filter(Boolean);
    for (const uid of targets) {
      await supabaseAdmin.from("notifications").insert({
        user_id: uid,
        type:
          data.lifecycle === "escalated"
            ? "dispute_escalated"
            : data.lifecycle.startsWith("resolved")
              ? "dispute_resolved"
              : "dispute_status_changed",
        body: `Dispute status: ${data.lifecycle.replace(/_/g, " ")}`,
        link: `/disputes/${data.disputeId}`,
      });
    }

    return { ok: true };
  });

export const runReconciliationCheckFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ disputeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: dispute } = await supabaseAdmin
      .from("disputes")
      .select("*, order:orders(id, amount, payment_status, stripe_payment_intent_id)")
      .eq("id", data.disputeId)
      .maybeSingle();
    if (!dispute) throw new Error("not_found");

    const checks: { label: string; ok: boolean; detail?: string }[] = [];
    const order: any = (dispute as any).order;
    checks.push({
      label: "Order linked",
      ok: !!order,
      detail: order ? `Order ${order.id}` : "No order on dispute",
    });
    if (order) {
      checks.push({
        label: "Payment intent present",
        ok: !!order.stripe_payment_intent_id,
        detail: order.stripe_payment_intent_id ?? "—",
      });
      checks.push({
        label: "Payment status final",
        ok: ["paid", "refunded", "partially_refunded"].includes(order.payment_status),
        detail: order.payment_status,
      });
    }
    if ((dispute as any).rebook_order_id) {
      const { data: rebook } = await supabaseAdmin
        .from("orders")
        .select("id, amount, payment_status")
        .eq("id", (dispute as any).rebook_order_id)
        .maybeSingle();
      checks.push({
        label: "Rebook order paid",
        ok: !!rebook && rebook.payment_status === "paid",
        detail: rebook ? `${rebook.payment_status} (${rebook.amount})` : "missing",
      });
    }
    return { checks, dispute };
  });

// ============================================================
// EVIDENCE
// ============================================================

export const listEvidenceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        status: z.enum(["pending", "approved", "rejected", "flagged", "locked"]).optional(),
        disputeId: z.string().uuid().optional(),
        reportId: z.string().uuid().optional(),
        limit: z.number().min(1).max(200).default(100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    let q = supabaseAdmin
      .from("moderation_evidence")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status) q = q.eq("status", data.status);
    if (data.disputeId) q = q.eq("dispute_id", data.disputeId);
    if (data.reportId) q = q.eq("report_id", data.reportId);
    const { data: rows } = await q;
    return { rows: rows ?? [] };
  });

export const reviewEvidenceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        evidenceId: z.string().uuid(),
        status: z.enum(["approved", "rejected", "flagged", "locked"]),
        notes: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: before } = await supabaseAdmin
      .from("moderation_evidence")
      .select("*")
      .eq("id", data.evidenceId)
      .maybeSingle();
    if (!before) throw new Error("not_found");
    if ((before as any).locked && data.status !== "locked") {
      throw new Error("Evidence is locked");
    }
    const patch: Record<string, unknown> = {
      status: data.status,
      review_notes: data.notes ?? null,
      reviewed_by: context.userId,
      reviewed_at: new Date().toISOString(),
    };
    if (data.status === "locked") patch.locked = true;
    const { data: after } = await supabaseAdmin
      .from("moderation_evidence")
      .update(patch)
      .eq("id", data.evidenceId)
      .select()
      .maybeSingle();

    await logAdmin({
      admin: context.userId,
      action: `evidence.${data.status}`,
      table: "moderation_evidence",
      id: data.evidenceId,
      subjectUserId: (before as any).uploaded_by,
      before,
      after,
      reason: data.notes,
    });
    return { ok: true };
  });

export const getEvidenceSignedUrlFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ path: z.string().min(1).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: signed, error } = await supabaseAdmin.storage
      .from("moderation-evidence")
      .createSignedUrl(data.path, 600);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

// ============================================================
// ADMIN NOTES + GLOBAL AUDIT FIREHOSE
// ============================================================

export const addAdminNoteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        subjectUserId: z.string().uuid(),
        note: z.string().min(1).max(2000),
        severity: z.enum(["info", "low", "medium", "high", "critical"]).default("info"),
        notifyUser: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await logEvent({
      subjectUserId: data.subjectUserId,
      eventType: data.notifyUser ? "warning_issued" : "admin_note",
      summary: data.note.slice(0, 200),
      severity: data.severity,
      actorUserId: context.userId,
      details: { full: data.note },
    });
    await logAdmin({
      admin: context.userId,
      action: data.notifyUser ? "warning.issued" : "note.added",
      subjectUserId: data.subjectUserId,
      after: { note: data.note, severity: data.severity },
    });
    if (data.notifyUser) {
      await supabaseAdmin.from("notifications").insert({
        user_id: data.subjectUserId,
        type: "admin_warning_issued",
        body: `Admin warning: ${data.note.slice(0, 400)}`,
        link: `/profile`,
      });
    }
    return { ok: true };
  });

export const getGlobalAuditFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        eventTypes: z.array(z.string()).optional(),
        severity: z.string().optional(),
        limit: z.number().min(1).max(200).default(100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    let q = supabaseAdmin
      .from("account_audit_log")
      .select("*")
      .order("occurred_at", { ascending: false })
      .limit(data.limit);
    if (data.eventTypes?.length) q = q.in("event_type", data.eventTypes as any);
    if (data.severity) q = q.eq("severity", data.severity as any);
    const { data: rows } = await q;

    const userIds = Array.from(
      new Set((rows ?? []).flatMap((r: any) => [r.subject_user_id, r.actor_user_id].filter(Boolean))),
    );
    let profileMap: Record<string, { username: string; shop_name: string | null }> = {};
    if (userIds.length) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, username, shop_name")
        .in("id", userIds);
      profileMap = Object.fromEntries(
        (profiles ?? []).map((p: any) => [p.id, { username: p.username, shop_name: p.shop_name }]),
      );
    }
    return { rows: rows ?? [], profiles: profileMap };
  });
