// Hourly cron: sends shipment reminders, flags late shipments, auto-cancels
// orders that are >72h past the shipping deadline.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/hooks/shipping-reminders")({
  server: {
    handlers: {
      POST: async () => {
        const now = new Date();
        const out = { reminders_sent: 0, late_flagged: 0, auto_cancelled: 0, errors: [] as string[] };

        // Find orders still in pending_shipment/label_created with shipping_due_at set
        const { data: orders, error } = await supabaseAdmin
          .from("orders")
          .select("id, seller_id, buyer_id, title, shipping_due_at, is_late_shipment, ship_reminder_count, last_ship_reminder_at, shipping_status, paid_at, first_scan_at")
          .in("shipping_status", ["pending_shipment", "label_created"])
          .eq("payment_status", "paid")
          .not("shipping_due_at", "is", null)
          .limit(500);
        if (error) {
          console.error("[shipping-reminders] query failed", error);
          return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }

        for (const o of orders ?? []) {
          try {
            const due = new Date(o.shipping_due_at as string);
            const msToDue = due.getTime() - now.getTime();
            const hoursToDue = msToDue / 3_600_000;

            // 24h before due → reminder #1
            // At due → reminder #2
            // 24h past due → late flag + reminder #3
            // 72h past due → auto-cancel
            if (hoursToDue <= -72) {
              // Auto-cancel
              await supabaseAdmin.from("orders").update({
                status: "cancelled",
                payout_eligible_at: null,
                shipping_status: "pending_shipment",
              } as any).eq("id", o.id);
              await supabaseAdmin.from("order_cancellations").insert({
                order_id: o.id,
                cancelled_by_user_id: null,
                reason: "auto_cancelled_late_shipment",
                notes: "Auto-cancelled: seller did not ship within 72h of deadline",
              } as any);
              await supabaseAdmin.from("notifications").insert([
                { user_id: o.buyer_id, type: "order_auto_cancelled", body: `Your order "${o.title}" was auto-cancelled and refunded — the seller did not ship in time.`, link: "/orders" },
                { user_id: o.seller_id, type: "order_auto_cancelled", body: `Order "${o.title}" was auto-cancelled because it wasn't shipped within 72h past deadline. This counts as a late strike.`, link: "/seller" },
              ] as any);
              await supabaseAdmin.from("fraud_flags").insert({
                user_id: o.seller_id,
                flag_type: "missed_shipping_deadline_auto_cancel",
                severity: "high",
                details: { order_id: o.id, hours_past_due: Math.abs(hoursToDue).toFixed(1) },
              } as any);
              out.auto_cancelled++;
              continue;
            }

            if (hoursToDue <= -24 && !o.is_late_shipment) {
              await supabaseAdmin.from("orders").update({ is_late_shipment: true } as any).eq("id", o.id);
              await supabaseAdmin.from("fraud_flags").insert({
                user_id: o.seller_id,
                flag_type: "late_shipment",
                severity: "medium",
                details: { order_id: o.id, hours_past_due: Math.abs(hoursToDue).toFixed(1) },
              } as any);
              out.late_flagged++;
            }

            // Reminder cadence — every 24h since last reminder, up to 3
            const lastReminder = o.last_ship_reminder_at ? new Date(o.last_ship_reminder_at as string).getTime() : 0;
            const hoursSinceLast = (now.getTime() - lastReminder) / 3_600_000;
            const shouldRemind =
              (hoursToDue <= 24 && hoursToDue > 0 && (o.ship_reminder_count ?? 0) === 0) ||
              (hoursToDue <= 0 && (o.ship_reminder_count ?? 0) < 3 && hoursSinceLast >= 24);

            if (shouldRemind) {
              const overdue = hoursToDue <= 0;
              await supabaseAdmin.from("notifications").insert({
                user_id: o.seller_id,
                type: overdue ? "shipment_overdue" : "shipment_due_soon",
                body: overdue
                  ? `⚠️ Order "${o.title}" is overdue. Ship now to avoid auto-cancellation and account holds.`
                  : `Reminder: order "${o.title}" must ship within 24h.`,
                link: "/seller",
              } as any);
              await supabaseAdmin.from("orders").update({
                last_ship_reminder_at: now.toISOString(),
                ship_reminder_count: (o.ship_reminder_count ?? 0) + 1,
              } as any).eq("id", o.id);
              out.reminders_sent++;
            }
          } catch (e: any) {
            out.errors.push(`${o.id}: ${e.message ?? String(e)}`);
          }
        }

        return new Response(JSON.stringify({ ok: true, ...out }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
