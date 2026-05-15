import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  getPlatformRevenueSummaryFn,
  listPlatformRevenueFn,
} from "@/lib/platform-revenue.functions";
import { TrendingUp, TrendingDown, Wallet, Clock, Receipt, AlertTriangle } from "lucide-react";

const KIND_LABEL: Record<string, string> = {
  marketplace_commission: "Marketplace commission",
  intl_processing_fee: "International fee",
  tip_fee: "Tip platform fee",
  promotion: "Promotion revenue",
  shipping_adjustment_fee: "Shipping adj. fee",
  refund_loss: "Refund losses",
  dispute_loss: "Dispute losses",
  stripe_processing_fee: "Stripe processing fee",
  adjustment: "Adjustment",
};

function fmt(cents: number) {
  const v = (cents || 0) / 100;
  return v.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function PlatformRevenueAdmin() {
  const [days, setDays] = useState<number | null>(30);
  const summaryFn = useServerFn(getPlatformRevenueSummaryFn);
  const listFn = useServerFn(listPlatformRevenueFn);

  const summary = useQuery({
    queryKey: ["admin-revenue-summary", days],
    queryFn: () => summaryFn({ data: { sinceDays: days ?? undefined } }),
  });

  const ledger = useQuery({
    queryKey: ["admin-revenue-list"],
    queryFn: () => listFn({ data: { limit: 50 } }),
  });

  if (summary.isLoading) return <p className="text-sm text-muted-foreground">Loading revenue…</p>;
  if (summary.error) {
    return (
      <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
        {(summary.error as any)?.message ?? "Failed to load"}
      </p>
    );
  }

  const s = summary.data!;
  const kindRows = Object.entries(s.byKind ?? {});

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {[
          { l: "7d", v: 7 },
          { l: "30d", v: 30 },
          { l: "90d", v: 90 },
          { l: "All time", v: null },
        ].map((opt) => (
          <button
            key={opt.l}
            onClick={() => setDays(opt.v)}
            className={`rounded-full px-3 py-1 font-bold ${
              days === opt.v
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {opt.l}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={<TrendingUp className="h-4 w-4" />} label="Gross fees" value={fmt(s.grossCents)} accent="text-emerald-500" />
        <Stat icon={<TrendingDown className="h-4 w-4" />} label="Refund / dispute losses" value={fmt(s.lossesCents)} accent="text-destructive" />
        <Stat icon={<Receipt className="h-4 w-4" />} label="Net platform earnings" value={fmt(s.netCents)} accent="text-primary" />
        <Stat icon={<Wallet className="h-4 w-4" />} label="Stripe available" value={s.balance ? fmt(s.balance.available_cents) : "—"} />
        <Stat icon={<Clock className="h-4 w-4" />} label="Stripe pending" value={s.balance ? fmt(s.balance.pending_cents) : "—"} />
        <Stat icon={<TrendingUp className="h-4 w-4" />} label="Completed payouts" value={fmt(s.payouts.paid_cents)} sub={`${s.payouts.count} transfer(s)`} />
      </div>

      <div className="rounded-xl bg-card p-4">
        <p className="mb-2 text-xs font-bold uppercase text-muted-foreground">Breakdown by source</p>
        {kindRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No revenue events in this window.</p>
        ) : (
          <ul className="divide-y divide-border">
            {kindRows.map(([k, v]) => (
              <li key={k} className="flex items-center justify-between py-2 text-sm">
                <span>{KIND_LABEL[k] ?? k}</span>
                <span className={`font-mono ${v.total_cents < 0 ? "text-destructive" : ""}`}>
                  {fmt(v.total_cents)} <span className="text-xs text-muted-foreground">({v.count})</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl bg-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-bold uppercase text-muted-foreground">Recent ledger entries</p>
          <button
            onClick={() => ledger.refetch()}
            className="rounded-md bg-muted px-2 py-1 text-[10px]"
          >
            Refresh
          </button>
        </div>
        {ledger.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <ul className="divide-y divide-border">
            {((ledger.data?.rows ?? []) as any[]).map((r) => (
              <li key={r.id} className="py-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono">{KIND_LABEL[r.kind] ?? r.kind}</span>
                  <span className={`font-mono font-semibold ${Number(r.amount_cents) < 0 ? "text-destructive" : "text-emerald-500"}`}>
                    {fmt(Number(r.amount_cents))}
                  </span>
                </div>
                <div className="mt-0.5 text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()}
                  {r.stripe_payment_intent_id && <> · <span className="font-mono">{r.stripe_payment_intent_id.slice(0, 14)}…</span></>}
                </div>
              </li>
            ))}
            {(ledger.data?.rows ?? []).length === 0 && (
              <li className="py-2 text-xs text-muted-foreground">No entries yet.</li>
            )}
          </ul>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Platform commissions are routed to the platform Stripe account via Connect{" "}
          <span className="font-mono">application_fee_amount</span> and never enter seller payable
          balances. Owner / admin accounts are exempt from trust-tier payout restrictions.
        </span>
      </div>
    </div>
  );
}

function Stat({
  icon, label, value, sub, accent,
}: { icon: React.ReactNode; label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl bg-card p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className={`mt-1 text-base font-bold ${accent ?? ""}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
