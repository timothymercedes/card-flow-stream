// Phase 6: Stripe ↔ orders reconciliation. Owner-only.
// Pulls recent paid orders that have a stripe_charge_id, fetches the
// matching charge from Stripe, and flags any drift (status / refund amount)
// into the existing financial_integrity_alerts table.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { reconcileStripeCharges } from "./stripe-reconcile.server";

export const runStripeReconciliationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      sinceDays: z.number().int().min(1).max(90).optional(),
      limit: z.number().int().min(1).max(500).optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const isOwner = ((roles ?? []) as any[]).some((r) => r.role === "owner");
    if (!isOwner) throw new Error("forbidden: owner role required");
    return reconcileStripeCharges({
      sinceDays: data.sinceDays ?? 7,
      limit: data.limit ?? 200,
    });
  });
