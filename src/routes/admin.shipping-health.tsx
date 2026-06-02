import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { adminReleasePayout } from "@/lib/payouts.functions";

export const Route = createFileRoute("/admin/shipping-health")({
  head: () => ({ meta: [{ title: "Shipping health — Admin" }] }),
  component: Page,
});

function Page() {
  const [flagged, setFlagged] = useState<any[]>([]);
  const [stale, setStale] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any[]>([]);
  const release = useServerFn(adminReleasePayout);

  useEffect(() => {
    (async () => {
      const { data: f } = await supabase
        .from("fraud_flags")
        .select("id, user_id, flag_type, severity, details, created_at")
        .in("flag_type", ["label_never_scanned", "suspicious_seller_late_rate", "late_shipment", "missed_shipping_deadline_auto_cancel"])
        .is("resolved_at", null)
        .order("created_at", { ascending: false })
        .limit(50);
      setFlagged(f ?? []);

      const cutoff = new Date(Date.now() - 48 * 3_600_000).toISOString();
      const { data: s } = await supabase
        .from("orders")
        .select("id, title, seller_id, label_purchased_at, tracking_number, carrier")
        .eq("shipping_status", "label_created")
        .is("first_scan_at", null)
        .lt("label_purchased_at", cutoff)
        .order("label_purchased_at", { ascending: true })
        .limit(100);
      setStale(s ?? []);

      const { data: a } = await supabase
        .from("mv_seller_shipping_analytics" as any)
        .select("*")
        .gte("total_orders", 5)
        .order("late_pct", { ascending: false })
        .limit(20);
      setAnalytics((a as any[]) ?? []);
    })();
  }, []);

  async function handleRelease(orderId: string) {
    const reason = prompt("Reason for manual release?");
    if (!reason) return;
    try {
      await release({ data: { orderId, reason } });
      toast.success("Payout released");
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <AppShell>
      <div className="px-4 py-6 max-w-6xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Shipping Health</h1>

        <Card className="p-4">
          <h2 className="font-semibold mb-3">Open fraud flags ({flagged.length})</h2>
          <div className="space-y-2 max-h-96 overflow-auto">
            {flagged.map(f => (
              <div key={f.id} className="text-sm border border-border rounded p-2 flex justify-between">
                <div>
                  <div className="font-medium">{f.flag_type} <span className="text-xs text-muted-foreground">({f.severity})</span></div>
                  <div className="text-xs text-muted-foreground">seller {String(f.user_id).slice(0,8)} · {new Date(f.created_at).toLocaleString()}</div>
                  <pre className="text-xs mt-1">{JSON.stringify(f.details)}</pre>
                </div>
              </div>
            ))}
            {flagged.length === 0 && <p className="text-sm text-muted-foreground">No open flags.</p>}
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="font-semibold mb-3">Labels with no carrier scan &gt;48h ({stale.length})</h2>
          <div className="space-y-2 max-h-96 overflow-auto">
            {stale.map(o => (
              <div key={o.id} className="text-sm border border-border rounded p-2 flex justify-between items-center">
                <div>
                  <div className="font-medium">{o.title}</div>
                  <div className="text-xs text-muted-foreground">{o.carrier} · {o.tracking_number} · purchased {new Date(o.label_purchased_at).toLocaleString()}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => handleRelease(o.id)}>Force release payout</Button>
              </div>
            ))}
            {stale.length === 0 && <p className="text-sm text-muted-foreground">All labels scanned within 48h.</p>}
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="font-semibold mb-3">Sellers ranked by late rate</h2>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b border-border">
              <tr>
                <th className="text-left p-2">Seller</th>
                <th className="text-right p-2">Orders</th>
                <th className="text-right p-2">Delivery %</th>
                <th className="text-right p-2">Lost %</th>
                <th className="text-right p-2">Late %</th>
                <th className="text-right p-2">Avg label→scan</th>
              </tr>
            </thead>
            <tbody>
              {analytics.map((s: any) => (
                <tr key={s.seller_id} className="border-b border-border/30">
                  <td className="p-2">{String(s.seller_id).slice(0,8)}</td>
                  <td className="p-2 text-right">{s.total_orders}</td>
                  <td className="p-2 text-right">{s.delivery_success_pct ?? "—"}</td>
                  <td className="p-2 text-right">{s.lost_pct ?? "—"}</td>
                  <td className="p-2 text-right text-amber-500">{s.late_pct ?? "—"}</td>
                  <td className="p-2 text-right">{s.avg_hours_label_to_scan ? `${Number(s.avg_hours_label_to_scan).toFixed(1)}h` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </AppShell>
  );
}
