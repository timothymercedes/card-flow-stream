// Phase 6: Stripe reconciliation core (server-only).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getStripe } from "./stripe.server";

export type ReconcileResult = {
  scanned: number;
  checked: number;
  newAlerts: number;
  errors: number;
};

type OrderRow = {
  id: string;
  amount: number | null;
  refunded_amount: number | null;
  payment_status: string | null;
  stripe_charge_id: string | null;
};

const TOLERANCE_CENTS = 2;

export async function reconcileStripeCharges(opts: {
  sinceDays: number;
  limit: number;
}): Promise<ReconcileResult> {
  const since = new Date(Date.now() - opts.sinceDays * 86400000).toISOString();
  const { data: orders, error } = await supabaseAdmin
    .from("orders")
    .select("id,amount,refunded_amount,payment_status,stripe_charge_id")
    .not("stripe_charge_id", "is", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(opts.limit);
  if (error) throw new Error(error.message);

  const rows = (orders ?? []) as OrderRow[];
  let stripe: ReturnType<typeof getStripe>;
  try {
    stripe = getStripe();
  } catch (e: any) {
    console.warn("[stripe-reconcile] Stripe not configured:", e?.message);
    return { scanned: rows.length, checked: 0, newAlerts: 0, errors: 0 };
  }

  let checked = 0;
  let errors = 0;
  const alerts: any[] = [];

  for (const o of rows) {
    if (!o.stripe_charge_id) continue;
    try {
      const charge = await stripe.charges.retrieve(o.stripe_charge_id);
      checked += 1;
      const localRefundCents = Math.round(Number(o.refunded_amount || 0) * 100);
      const stripeRefundCents = Number(charge.amount_refunded || 0);

      // 1. Charge not succeeded but we marked it paid
      if (o.payment_status === "paid" && charge.status !== "succeeded") {
        alerts.push({
          severity: "critical",
          kind: "stripe_charge_status_mismatch",
          order_id: o.id,
          amount_cents: Number(charge.amount || 0),
          details: {
            local_payment_status: o.payment_status,
            stripe_charge_status: charge.status,
            charge_id: charge.id,
          },
        });
      }

      // 2. Refund amount drift
      if (Math.abs(stripeRefundCents - localRefundCents) > TOLERANCE_CENTS) {
        alerts.push({
          severity: "warning",
          kind: "stripe_refund_drift",
          order_id: o.id,
          amount_cents: stripeRefundCents - localRefundCents,
          details: {
            local_refund_cents: localRefundCents,
            stripe_refund_cents: stripeRefundCents,
            charge_id: charge.id,
          },
        });
      }
    } catch (e: any) {
      errors += 1;
      console.error("[stripe-reconcile] charge fetch failed", o.stripe_charge_id, e?.message);
      alerts.push({
        severity: "warning",
        kind: "stripe_charge_unreadable",
        order_id: o.id,
        amount_cents: null,
        details: { charge_id: o.stripe_charge_id, error: String(e?.message ?? e) },
      });
    }
  }

  let newAlerts = 0;
  if (alerts.length > 0) {
    // De-dupe against already-open alerts of the same kind for the same order.
    const orderIds = Array.from(new Set(alerts.map((a) => a.order_id)));
    const { data: existing } = await supabaseAdmin
      .from("financial_integrity_alerts" as any)
      .select("order_id,kind")
      .in("order_id", orderIds)
      .is("resolved_at", null);
    const existingSet = new Set(
      ((existing ?? []) as any[]).map((r) => `${r.order_id}::${r.kind}`),
    );
    const toInsert = alerts.filter((a) => !existingSet.has(`${a.order_id}::${a.kind}`));
    if (toInsert.length > 0) {
      const { error: insErr } = await supabaseAdmin
        .from("financial_integrity_alerts" as any)
        .insert(toInsert);
      if (insErr) console.error("[stripe-reconcile] insert alerts failed", insErr);
      else newAlerts = toInsert.length;
    }
  }

  return { scanned: rows.length, checked, newAlerts, errors };
}
