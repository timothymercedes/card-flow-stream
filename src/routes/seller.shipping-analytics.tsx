import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { SellerVerificationGate } from "@/components/SellerVerificationGate";
import { getSellerShippingAnalytics, getAvailableBalance } from "@/lib/payouts.functions";
import { Card } from "@/components/ui/card";
import { Truck, Package, Clock, AlertTriangle, DollarSign, TimerReset } from "lucide-react";

export const Route = createFileRoute("/seller/shipping-analytics")({
  head: () => ({ meta: [
    { title: "Shipping analytics — PullBid Live" },
    { name: "description", content: "Track your shipping speed, delivery success, and payout-eligible balance." },
  ] }),
  component: Page,
});

function fmtHours(h: number | null | undefined) {
  if (h == null) return "—";
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}
function fmtPct(p: number | null | undefined) {
  return p == null ? "—" : `${Number(p).toFixed(1)}%`;
}
function fmtCents(c: number) {
  return `$${(c / 100).toFixed(2)}`;
}

function Page() {
  const fetchAnalytics = useServerFn(getSellerShippingAnalytics);
  const fetchBalance = useServerFn(getAvailableBalance);
  const { data: a } = useQuery({ queryKey: ["seller-shipping-analytics"], queryFn: () => fetchAnalytics() });
  const { data: b } = useQuery({ queryKey: ["seller-available-balance"], queryFn: () => fetchBalance() });
  const s = a?.analytics as any;

  return (
    <SellerVerificationGate>
      <AppShell>
        <div className="px-4 py-6 max-w-5xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Shipping & Payouts</h1>
            <p className="text-muted-foreground text-sm">Your fulfillment speed, delivery rate, and what's ready to withdraw.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-4">
              <div className="flex items-center gap-2 text-emerald-500 text-sm font-medium"><DollarSign className="w-4 h-4" /> Available now</div>
              <div className="text-3xl font-bold mt-2">{fmtCents(b?.availableCents ?? 0)}</div>
              <div className="text-xs text-muted-foreground mt-1">{b?.eligibleOrders ?? 0} order{(b?.eligibleOrders ?? 0) === 1 ? "" : "s"} cleared</div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-amber-500 text-sm font-medium"><Clock className="w-4 h-4" /> Pending release</div>
              <div className="text-3xl font-bold mt-2">{fmtCents(b?.pendingCents ?? 0)}</div>
              <div className="text-xs text-muted-foreground mt-1">Held until carrier scans + 24h</div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-rose-500 text-sm font-medium"><AlertTriangle className="w-4 h-4" /> Account holds</div>
              <div className="text-3xl font-bold mt-2">{b?.activeHolds?.length ?? 0}</div>
              <div className="text-xs text-muted-foreground mt-1">{b?.activeHolds?.[0]?.reason ?? "None — payouts unblocked"}</div>
            </Card>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat icon={Package} label="Total orders" value={s?.total_orders ?? 0} />
            <Stat icon={Truck} label="Delivery success" value={fmtPct(s?.delivery_success_pct)} />
            <Stat icon={AlertTriangle} label="Lost packages" value={fmtPct(s?.lost_pct)} />
            <Stat icon={TimerReset} label="Late rate" value={fmtPct(s?.late_pct)} />
          </div>

          <Card className="p-4">
            <h2 className="font-semibold mb-3">Average fulfillment speed</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <Row label="Paid → label purchased" v={fmtHours(s?.avg_hours_paid_to_label)} />
              <Row label="Label → first carrier scan" v={fmtHours(s?.avg_hours_label_to_scan)} />
              <Row label="Scan → delivered" v={fmtHours(s?.avg_hours_scan_to_delivered)} />
            </div>
          </Card>

          <Card className="p-4 bg-muted/30">
            <h3 className="font-semibold text-sm mb-2">How payouts work</h3>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
              <li>Funds stay <strong>Pending</strong> until the carrier scans your label.</li>
              <li>After first scan, a 24h fraud-protection hold runs, then funds become <strong>Available</strong>.</li>
              <li>Delivery confirmation releases any remaining balance immediately.</li>
              <li>Refunds, disputes, and lost packages reverse eligibility automatically.</li>
              <li>Platform 5% commission + Stripe processing fees are taken before payout.</li>
            </ul>
          </Card>
        </div>
      </AppShell>
    </SellerVerificationGate>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: any }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs"><Icon className="w-4 h-4" /> {label}</div>
      <div className="text-2xl font-bold mt-2">{value}</div>
    </Card>
  );
}
function Row({ label, v }: { label: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-border/40 pb-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}
