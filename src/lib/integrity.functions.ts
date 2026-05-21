// Phase 4: Financial integrity — owner-only RPCs.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const runIntegrityReconciliationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ sinceDays: z.number().int().min(1).max(365).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const since = data.sinceDays
      ? new Date(Date.now() - data.sinceDays * 86400000).toISOString()
      : null;
    const { data: rows, error } = await supabase.rpc(
      "admin_run_financial_reconciliation" as any,
      { _since: since },
    );
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    return {
      scannedOrders: Number(row?.scanned_orders ?? 0),
      missingCommission: Number(row?.missing_commission ?? 0),
      missingShippingMargin: Number(row?.missing_shipping_margin ?? 0),
      payoutDrift: Number(row?.payout_drift ?? 0),
      newAlerts: Number(row?.new_alerts ?? 0),
    };
  });

export const listIntegrityAlertsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      limit: z.number().int().min(1).max(500).optional(),
      onlyUnresolved: z.boolean().optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.rpc("admin_list_integrity_alerts" as any, {
      _limit: data.limit ?? 100,
      _only_unresolved: data.onlyUnresolved ?? true,
    });
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as any[] };
  });

export const resolveIntegrityAlertFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ alertId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.rpc("admin_resolve_integrity_alert" as any, {
      _alert_id: data.alertId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
