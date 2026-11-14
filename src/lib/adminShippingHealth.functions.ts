import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { canAccessFinancialAdmin } from "@/lib/adminAccess";

/** Caller's financial-admin status, read through their own session. */
export const getFinancialAdminAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    return { allowed: canAccessFinancialAdmin((data ?? []).map((r: any) => r.role)) };
  });

export const getShippingHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (!canAccessFinancialAdmin((roles ?? []).map((r: any) => r.role))) throw new Error("Admin only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cutoff = new Date(Date.now() - 48 * 3_600_000).toISOString();
    const [f, s, a] = await Promise.all([
      supabaseAdmin.from("fraud_flags").select("id, user_id, flag_type, severity, details, created_at")
        .in("flag_type", ["label_never_scanned", "suspicious_seller_late_rate", "late_shipment", "missed_shipping_deadline_auto_cancel"])
        .is("resolved_at", null).order("created_at", { ascending: false }).limit(50),
      supabaseAdmin.from("orders").select("id, title, seller_id, label_purchased_at, tracking_number, carrier")
        .eq("shipping_status", "label_created").is("first_scan_at", null).lt("label_purchased_at", cutoff)
        .order("label_purchased_at", { ascending: true }).limit(100),
      supabaseAdmin.from("mv_seller_shipping_analytics" as any).select("*").gte("total_orders", 5)
        .order("late_pct", { ascending: false }).limit(20),
    ]);
    return { flagged: (f.data ?? []) as any[], stale: (s.data ?? []) as any[], analytics: (a.data ?? []) as any[] };
  });
