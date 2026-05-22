// Every 6 hours: detect shipping fraud signals and freeze suspicious sellers.
// - Labels created >48h with no carrier scan → fraud_flags(label_never_scanned)
// - Sellers with >=3 such orders in 30d → auto account_holds(active)
// - Sellers with late_rate >25% over 10+ orders → suspicious_seller flag
// - Labels >14d with no scan → mark lost_package
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/hooks/fraud-sweep")({
  server: {
    handlers: {
      POST: async () => {
        const out = { labels_flagged: 0, sellers_held: 0, suspicious: 0, lost_marked: 0 };

        // 1. Labels created >48h ago with no first_scan_at
        const cutoff48 = new Date(Date.now() - 48 * 3_600_000).toISOString();
        const { data: stale } = await supabaseAdmin
          .from("orders")
          .select("id, seller_id, label_purchased_at, title")
          .eq("shipping_status", "label_created")
          .is("first_scan_at", null)
          .lt("label_purchased_at", cutoff48)
          .limit(500);

        for (const o of stale ?? []) {
          // Skip if already flagged for this order
          const { data: exists } = await supabaseAdmin
            .from("fraud_flags")
            .select("id")
            .eq("user_id", o.seller_id)
            .eq("flag_type", "label_never_scanned")
            .contains("details", { order_id: o.id })
            .maybeSingle();
          if (exists) continue;

          await supabaseAdmin.from("fraud_flags").insert({
            user_id: o.seller_id,
            flag_type: "label_never_scanned",
            severity: "medium",
            details: { order_id: o.id, title: o.title, label_purchased_at: o.label_purchased_at },
          } as any);
          out.labels_flagged++;
        }

        // 2. Mark lost_package after 14d with no scan
        const cutoff14 = new Date(Date.now() - 14 * 86_400_000).toISOString();
        const { data: lost } = await supabaseAdmin
          .from("orders")
          .select("id, buyer_id, seller_id, title")
          .eq("shipping_status", "label_created")
          .is("first_scan_at", null)
          .lt("label_purchased_at", cutoff14)
          .limit(200);
        for (const o of lost ?? []) {
          const { error } = await supabaseAdmin.rpc("set_order_shipping_status" as any, {
            _order_id: o.id,
            _status: "lost_package",
            _source: "fraud_sweep_lost_detection",
            _message: "No carrier scan within 14 days of label purchase",
          });
          if (!error) {
            out.lost_marked++;
            await supabaseAdmin.from("notifications").insert([
              { user_id: o.buyer_id, type: "package_lost", body: `Your package "${o.title}" appears lost. Our team will refund you shortly.`, link: "/orders" },
              { user_id: o.seller_id, type: "package_lost", body: `Order "${o.title}" marked as lost (no carrier scan in 14 days). Payout cancelled.`, link: "/seller" },
            ] as any);
          }
        }

        // 3. Sellers with >=3 label_never_scanned in last 30d → place active hold
        const cutoff30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
        const { data: offenders } = await supabaseAdmin
          .from("fraud_flags")
          .select("user_id")
          .eq("flag_type", "label_never_scanned")
          .gte("created_at", cutoff30);

        const counts = new Map<string, number>();
        for (const f of offenders ?? []) {
          counts.set(f.user_id as string, (counts.get(f.user_id as string) ?? 0) + 1);
        }
        for (const [user_id, count] of counts) {
          if (count < 3) continue;
          // Skip if already on active hold
          const { data: held } = await supabaseAdmin
            .from("account_holds")
            .select("id").eq("user_id", user_id).eq("status", "active").maybeSingle();
          if (held) continue;
          await supabaseAdmin.from("account_holds").insert({
            user_id,
            status: "active",
            source: "fraud_auto",
            reason: `Auto-hold: ${count} unshipped labels in last 30 days`,
            notes: "Triggered by fraud-sweep. Resolve unshipped orders before lifting.",
          } as any);
          out.sellers_held++;
        }

        // 4. Suspicious-seller flag: late_rate > 25% over >=10 orders
        const { data: lateStats } = await supabaseAdmin.rpc(
          "refresh_seller_shipping_analytics" as any
        );
        void lateStats;
        const { data: analytics } = await supabaseAdmin
          .from("mv_seller_shipping_analytics" as any)
          .select("seller_id, total_orders, late_pct")
          .gte("total_orders", 10)
          .gt("late_pct", 25);
        for (const s of (analytics as any[]) ?? []) {
          const { data: exists } = await supabaseAdmin
            .from("fraud_flags")
            .select("id")
            .eq("user_id", s.seller_id)
            .eq("flag_type", "suspicious_seller_late_rate")
            .is("resolved_at", null)
            .maybeSingle();
          if (exists) continue;
          await supabaseAdmin.from("fraud_flags").insert({
            user_id: s.seller_id,
            flag_type: "suspicious_seller_late_rate",
            severity: "high",
            details: { late_pct: s.late_pct, total_orders: s.total_orders },
          } as any);
          out.suspicious++;
        }

        return new Response(JSON.stringify({ ok: true, ...out }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
