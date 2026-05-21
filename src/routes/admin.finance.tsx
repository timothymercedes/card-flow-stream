import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeChannel } from "@/lib/realtime";
import { toast } from "sonner";
import {
  Wallet, TrendingUp, TrendingDown, Receipt, Truck, Users, Radio,
  ArrowDownToLine, RefreshCcw, Clock, CheckCircle2, AlertTriangle,
  Crown, ShoppingBag, Banknote, ArrowLeft,
} from "lucide-react";
import {
  getOwnerFinanceOverviewFn,
  getRevenueByPeriodFn,
  getRevenueByStreamFn,
  getRevenueBySellerFn,
  getOwnerPersonalOrdersFn,
  listPlatformPayoutsFn,
  requestPlatformPayoutFn,
  listOwnerPersonalPayoutsFn,
  getOrdersAuditFn,
} from "@/lib/owner-finance.functions";
import {
  listPlatformRevenueFn,
} from "@/lib/platform-revenue.functions";
import {
  requestPayoutFn,
  getSellerPayableFn,
} from "@/lib/payouts.functions";
import {
  runIntegrityReconciliationFn,
  listIntegrityAlertsFn,
  resolveIntegrityAlertFn,
} from "@/lib/integrity.functions";
import { runStripeReconciliationFn } from "@/lib/stripe-reconcile.functions";


export const Route = createFileRoute("/admin/finance")({
  head: () => ({ meta: [{ title: "Finance — PullBid Live" }] }),
  component: OwnerFinanceDashboard,
});

type RangeKey = "1d" | "7d" | "30d" | "90d" | "365d" | "all";
const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: "1d", label: "Day", days: 1 },
  { key: "7d", label: "Week", days: 7 },
  { key: "30d", label: "Month", days: 30 },
  { key: "90d", label: "Quarter", days: 90 },
  { key: "365d", label: "Year", days: 365 },
  { key: "all", label: "All", days: null },
];

type TabKey =
  | "overview"
  | "platform"
  | "personal"
  | "payouts"
  | "streams"
  | "sellers"
  | "shipping"
  | "refunds"
  | "transactions"
  | "audit"
  | "integrity";


function fmt(cents?: number | null) {
  const v = (cents || 0) / 100;
  return v.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

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

function OwnerFinanceDashboard() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [isOwner, setIsOwner] = useState<boolean | null>(null);

  const [tab, setTab] = useState<TabKey>("overview");
  const [range, setRange] = useState<RangeKey>("30d");
  const sinceDays = useMemo(() => RANGES.find((r) => r.key === range)?.days ?? undefined, [range]);

  // Role check
  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate({ to: "/auth" }); return; }
    supabase.from("user_roles").select("role").eq("user_id", user.id)
      .then(({ data }) => {
        const roles = ((data ?? []) as any[]).map((r) => r.role);
        setIsOwner(roles.includes("owner"));
      });
  }, [user, authLoading, navigate]);

  // Server fn wrappers
  const overviewFn = useServerFn(getOwnerFinanceOverviewFn);
  const trendFn = useServerFn(getRevenueByPeriodFn);
  const streamFn = useServerFn(getRevenueByStreamFn);
  const sellerFn = useServerFn(getRevenueBySellerFn);
  const personalOrdersFn = useServerFn(getOwnerPersonalOrdersFn);
  const platformPayoutsFn = useServerFn(listPlatformPayoutsFn);
  const reqPlatformFn = useServerFn(requestPlatformPayoutFn);
  const personalPayoutsFn = useServerFn(listOwnerPersonalPayoutsFn);
  const reqSellerPayoutFn = useServerFn(requestPayoutFn);
  const ledgerFn = useServerFn(listPlatformRevenueFn);
  const sellerPayableFn = useServerFn(getSellerPayableFn);

  const enabled = isOwner === true;

  const overview = useQuery({
    queryKey: ["owner-finance-overview", sinceDays],
    queryFn: () => overviewFn({ data: { sinceDays } }),
    enabled,
  });
  const trend = useQuery({
    queryKey: ["owner-finance-trend", sinceDays],
    queryFn: () => trendFn({ data: { bucket: sinceDays && sinceDays <= 31 ? "day" : sinceDays && sinceDays <= 120 ? "week" : "month", sinceDays } as any }),
    enabled,
  });
  const streams = useQuery({
    queryKey: ["owner-finance-streams", sinceDays],
    queryFn: () => streamFn({ data: { sinceDays, limit: 50 } }),
    enabled: enabled && tab === "streams",
  });
  const sellers = useQuery({
    queryKey: ["owner-finance-sellers", sinceDays],
    queryFn: () => sellerFn({ data: { sinceDays, limit: 50 } }),
    enabled: enabled && tab === "sellers",
  });
  const personalOrders = useQuery({
    queryKey: ["owner-finance-personal-orders", sinceDays],
    queryFn: () => personalOrdersFn({ data: { sinceDays, limit: 100 } }),
    enabled: enabled && (tab === "personal" || tab === "transactions"),
  });
  const platformPayouts = useQuery({
    queryKey: ["owner-finance-platform-payouts"],
    queryFn: () => platformPayoutsFn({ data: { limit: 100 } }),
    enabled: enabled && (tab === "payouts" || tab === "platform"),
  });
  const personalPayouts = useQuery({
    queryKey: ["owner-finance-personal-payouts"],
    queryFn: () => personalPayoutsFn({ data: { limit: 100 } }),
    enabled: enabled && (tab === "payouts" || tab === "personal"),
  });
  const ledger = useQuery({
    queryKey: ["owner-finance-ledger"],
    queryFn: () => ledgerFn({ data: { limit: 200 } }),
    enabled: enabled && (tab === "platform" || tab === "transactions" || tab === "refunds"),
  });
  const sellerPayable = useQuery({
    queryKey: ["owner-seller-payable"],
    queryFn: () => sellerPayableFn(),
    enabled: enabled && (tab === "personal" || tab === "payouts"),
  });

  // Realtime: invalidate on revenue / payout changes
  useRealtimeChannel({ name: "owner-finance-rt", enabled }, (ch) =>
    ch
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "platform_revenue" },
        () => qc.invalidateQueries({ queryKey: ["owner-finance-overview"] }))
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "platform_payouts" },
        () => {
          qc.invalidateQueries({ queryKey: ["owner-finance-platform-payouts"] });
          qc.invalidateQueries({ queryKey: ["owner-finance-overview"] });
        })
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "payout_requests" },
        () => qc.invalidateQueries({ queryKey: ["owner-finance-personal-payouts"] }))
  );

  if (authLoading || isOwner === null) {
    return <AppShell><div className="p-8 text-center text-sm text-muted-foreground">Loading…</div></AppShell>;
  }
  if (!isOwner) {
    return (
      <AppShell>
        <div className="p-8 text-center">
          <h1 className="text-xl font-bold">Owner only</h1>
          <p className="mt-2 text-sm text-muted-foreground">The financial dashboard is restricted to the platform owner.</p>
          <Link to="/admin" className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Back to Admin</Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-4 p-3 pb-24 sm:p-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Link to="/admin" className="rounded-md p-1.5 hover:bg-muted" aria-label="Back">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <Crown className="h-5 w-5 text-yellow-500" />
            <h1 className="text-lg font-extrabold sm:text-xl">Owner Finance</h1>
          </div>
          <button
            onClick={() => qc.invalidateQueries()}
            className="flex items-center gap-1 rounded-full bg-muted px-3 py-1.5 text-xs font-bold hover:bg-muted/70"
          >
            <RefreshCcw className="h-3 w-3" /> Refresh
          </button>
        </div>

        {/* Range filter */}
        <div className="flex flex-wrap items-center gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                range === r.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Tabs */}
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {([
            ["overview", "Overview"],
            ["platform", "Platform"],
            ["personal", "My Sales"],
            ["payouts", "Payouts"],
            ["streams", "Per Stream"],
            ["sellers", "Per Seller"],
            ["shipping", "Shipping"],
            ["refunds", "Refunds"],
            ["transactions", "Transactions"],
            ["audit", "Audit"],
            ["integrity", "Integrity"],

          ] as [TabKey, string][]).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition ${
                tab === k ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Content */}
        {tab === "overview" && <OverviewTab overview={overview.data} loading={overview.isLoading} trend={trend.data?.rows} />}
        {tab === "platform" && (
          <PlatformTab
            overview={overview.data}
            ledger={ledger.data?.rows ?? []}
            payouts={platformPayouts.data?.rows ?? []}
            onWithdraw={async (cents: number, dest: "platform_bank" | "owner_personal", notes?: string) => {
              try {
                await reqPlatformFn({ data: { amountCents: cents, destination: dest, notes } });
                toast.success("Platform payout requested");
                qc.invalidateQueries({ queryKey: ["owner-finance-platform-payouts"] });
                qc.invalidateQueries({ queryKey: ["owner-finance-overview"] });
              } catch (e: any) { toast.error(e?.message ?? "Failed"); }
            }}
          />
        )}
        {tab === "personal" && (
          <PersonalTab
            overview={overview.data}
            sellerPayable={sellerPayable.data}
            orders={personalOrders.data?.rows ?? []}
            payouts={personalPayouts.data?.rows ?? []}
            onWithdraw={async (cents: number) => {
              try {
                await reqSellerPayoutFn({ data: { amountCents: cents } });
                toast.success("Personal payout requested");
                qc.invalidateQueries({ queryKey: ["owner-finance-personal-payouts"] });
                qc.invalidateQueries({ queryKey: ["owner-seller-payable"] });
              } catch (e: any) { toast.error(e?.message ?? "Failed"); }
            }}
          />
        )}
        {tab === "payouts" && (
          <PayoutsTab platform={platformPayouts.data?.rows ?? []} personal={personalPayouts.data?.rows ?? []} />
        )}
        {tab === "streams" && <StreamsTab rows={streams.data?.rows ?? []} loading={streams.isLoading} />}
        {tab === "sellers" && <SellersTab rows={sellers.data?.rows ?? []} loading={sellers.isLoading} />}
        {tab === "shipping" && <ShippingTab overview={overview.data} />}
        {tab === "refunds" && <RefundsTab ledger={ledger.data?.rows ?? []} overview={overview.data} />}
        {tab === "transactions" && (
          <TransactionsTab orders={personalOrders.data?.rows ?? []} ledger={ledger.data?.rows ?? []} />
        )}
        {tab === "audit" && <AuditTab sinceDays={sinceDays} />}
        {tab === "integrity" && <IntegrityTab />}
      </div>

    </AppShell>
  );
}

// ---------- Subcomponents ----------

function Stat({ icon, label, value, accent, sub }: { icon: React.ReactNode; label: string; value: string; accent?: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <div className={`mt-1 text-lg font-extrabold tabular-nums ${accent ?? "text-foreground"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-extrabold">{title}</h2>
        {right}
      </div>
      {children}
    </div>
  );
}

function OverviewTab({ overview, loading, trend }: any) {
  if (loading || !overview) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const o = overview;
  const netProfit = o.netCents + o.shipping.netMarginCents;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat icon={<TrendingUp className="h-3 w-3" />} label="Platform Net" value={fmt(o.netCents)} accent="text-primary" sub={`Gross ${fmt(o.grossCents)}`} />
        <Stat icon={<Wallet className="h-3 w-3" />} label="Withdrawable" value={fmt(o.platform.availableCents)} accent="text-emerald-500" />
        <Stat icon={<ShoppingBag className="h-3 w-3" />} label="My Sales" value={fmt(o.personal.grossSalesCents)} accent="text-accent-foreground" sub={`${o.personal.orderCount} orders`} />
        <Stat icon={<Truck className="h-3 w-3" />} label="Shipping Margin" value={fmt(o.shipping.netMarginCents)} sub={`Charged ${fmt(o.shipping.chargedCents)}`} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Section title="Platform Earnings">
          <dl className="space-y-1.5 text-xs">
            <Row k="Net earnings (all-time)" v={fmt(o.platform.netEarningsCents)} />
            <Row k="Pending payouts" v={fmt(o.platform.pendingPayoutsCents)} />
            <Row k="Completed payouts" v={fmt(o.platform.completedPayoutsCents)} />
            <Row k="Available to withdraw" v={fmt(o.platform.availableCents)} accent="text-emerald-500" bold />
          </dl>
        </Section>
        <Section title="My Personal Sales">
          <dl className="space-y-1.5 text-xs">
            <Row k="Gross" v={fmt(o.personal.grossSalesCents)} />
            <Row k="Commission paid to platform" v={fmt(o.personal.commissionPaidCents)} />
            <Row k="Net payout" v={fmt(o.personal.netPayoutCents)} accent="text-emerald-500" bold />
            <Row k="Refunded" v={fmt(o.personal.refundedCents)} accent="text-destructive" />
          </dl>
        </Section>
      </div>

      <Section title="Net profit (period)" right={<span className="text-xs text-muted-foreground">Platform net + shipping margin</span>}>
        <div className="text-2xl font-extrabold tabular-nums text-emerald-500">{fmt(netProfit)}</div>
      </Section>

      <Section title="Revenue trend">
        <TrendBars rows={trend ?? []} />
      </Section>

      <Section title="Breakdown by type">
        <ul className="space-y-1 text-xs">
          {Object.entries(o.byKind ?? {}).map(([k, v]: any) => (
            <li key={k} className="flex items-center justify-between">
              <span className="text-muted-foreground">{KIND_LABEL[k] ?? k} <span className="text-[10px]">({v.count})</span></span>
              <span className={`font-bold tabular-nums ${v.total_cents < 0 ? "text-destructive" : ""}`}>{fmt(v.total_cents)}</span>
            </li>
          ))}
          {Object.keys(o.byKind ?? {}).length === 0 && <li className="text-muted-foreground">No revenue yet.</li>}
        </ul>
      </Section>
    </div>
  );
}

function Row({ k, v, accent, bold }: { k: string; v: string; accent?: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-border/40 py-1 last:border-b-0">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className={`tabular-nums ${bold ? "font-extrabold" : "font-semibold"} ${accent ?? ""}`}>{v}</dd>
    </div>
  );
}

function TrendBars({ rows }: { rows: any[] }) {
  if (!rows || rows.length === 0) return <p className="text-xs text-muted-foreground">No data for this period.</p>;
  const max = Math.max(...rows.map((r) => Math.abs(Number(r.net_cents) || 0)), 1);
  return (
    <div className="flex h-32 items-end gap-1 overflow-x-auto">
      {rows.map((r, i) => {
        const v = Number(r.net_cents) || 0;
        const h = (Math.abs(v) / max) * 100;
        return (
          <div key={i} className="flex min-w-[12px] flex-1 flex-col items-center gap-0.5">
            <div
              className={`w-full rounded-t ${v >= 0 ? "bg-primary" : "bg-destructive"}`}
              style={{ height: `${Math.max(h, 2)}%` }}
              title={`${new Date(r.bucket_start).toLocaleDateString()} • ${fmt(v)}`}
            />
            <span className="text-[8px] text-muted-foreground">{new Date(r.bucket_start).toLocaleDateString(undefined, { month: "numeric", day: "numeric" })}</span>
          </div>
        );
      })}
    </div>
  );
}

function WithdrawForm({ available, onSubmit, destinations }: {
  available: number;
  onSubmit: (cents: number, dest: "platform_bank" | "owner_personal", notes?: string) => Promise<void> | void;
  destinations: { value: "platform_bank" | "owner_personal"; label: string }[];
}) {
  const [amount, setAmount] = useState("");
  const [dest, setDest] = useState<"platform_bank" | "owner_personal">(destinations[0].value);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const cents = Math.round((Number(amount) || 0) * 100);
  const invalid = cents <= 0 || cents > available;
  return (
    <form
      onSubmit={async (e) => { e.preventDefault(); if (invalid) return; setBusy(true); await onSubmit(cents, dest, notes || undefined); setBusy(false); setAmount(""); setNotes(""); }}
      className="space-y-2"
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold">$</span>
        <input
          type="number" step="0.01" min="0" max={available / 100}
          value={amount} onChange={(e) => setAmount(e.target.value)}
          placeholder={(available / 100).toFixed(2)}
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        />
      </div>
      <select value={dest} onChange={(e) => setDest(e.target.value as any)}
        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs">
        {destinations.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
      </select>
      <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="Notes (optional)"
        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs" />
      <button type="submit" disabled={invalid || busy}
        className="flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50">
        <ArrowDownToLine className="h-3 w-3" /> {busy ? "Requesting…" : "Withdraw"}
      </button>
      <p className="text-[10px] text-muted-foreground">Available: <span className="font-bold tabular-nums">{fmt(available)}</span></p>
    </form>
  );
}

function PlatformTab({ overview, ledger, payouts, onWithdraw }: any) {
  if (!overview) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat icon={<Receipt className="h-3 w-3" />} label="Net" value={fmt(overview.platform.netEarningsCents)} accent="text-primary" />
        <Stat icon={<Wallet className="h-3 w-3" />} label="Available" value={fmt(overview.platform.availableCents)} accent="text-emerald-500" />
        <Stat icon={<Clock className="h-3 w-3" />} label="Pending" value={fmt(overview.platform.pendingPayoutsCents)} />
        <Stat icon={<CheckCircle2 className="h-3 w-3" />} label="Paid out" value={fmt(overview.platform.completedPayoutsCents)} />
      </div>

      <Section title="Withdraw platform commission">
        <WithdrawForm
          available={overview.platform.availableCents}
          onSubmit={onWithdraw}
          destinations={[
            { value: "platform_bank", label: "Platform bank account" },
            { value: "owner_personal", label: "Move to my personal seller balance" },
          ]}
        />
      </Section>

      <Section title="Platform commission ledger">
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card text-muted-foreground">
              <tr><th className="py-1 text-left">When</th><th className="text-left">Kind</th><th className="text-right">Amount</th></tr>
            </thead>
            <tbody>
              {ledger.map((r: any) => (
                <tr key={r.id} className="border-t border-border/40">
                  <td className="py-1 text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                  <td>{KIND_LABEL[r.kind] ?? r.kind}</td>
                  <td className={`text-right font-bold tabular-nums ${Number(r.amount_cents) < 0 ? "text-destructive" : ""}`}>{fmt(Number(r.amount_cents))}</td>
                </tr>
              ))}
              {ledger.length === 0 && <tr><td colSpan={3} className="py-3 text-center text-muted-foreground">No revenue events yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Platform payout history">
        <PayoutsList rows={payouts} kind="platform" />
      </Section>
    </div>
  );
}

function PersonalTab({ overview, sellerPayable, orders, payouts, onWithdraw }: any) {
  if (!overview) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const available = Number(sellerPayable?.payable_cents ?? 0);
  return (
    <div className="space-y-4">
      <div className="rounded-md bg-accent/30 px-3 py-2 text-[11px] text-muted-foreground">
        Personal seller earnings are <strong>tracked separately</strong> from platform commissions. Withdrawals here come from your seller Stripe Connect balance only.
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat icon={<ShoppingBag className="h-3 w-3" />} label="Orders" value={String(overview.personal.orderCount)} />
        <Stat icon={<TrendingUp className="h-3 w-3" />} label="Gross sales" value={fmt(overview.personal.grossSalesCents)} accent="text-primary" />
        <Stat icon={<Wallet className="h-3 w-3" />} label="Withdrawable" value={fmt(available)} accent="text-emerald-500" />
        <Stat icon={<TrendingDown className="h-3 w-3" />} label="Refunded" value={fmt(overview.personal.refundedCents)} accent="text-destructive" />
      </div>

      <Section title="Withdraw personal seller earnings">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const cents = Math.round((Number(fd.get("amount")) || 0) * 100);
            if (cents <= 0 || cents > available) return;
            await onWithdraw(cents);
            (e.currentTarget as HTMLFormElement).reset();
          }}
          className="space-y-2"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold">$</span>
            <input name="amount" type="number" step="0.01" min="0" max={available / 100}
              placeholder={(available / 100).toFixed(2)}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
          </div>
          <button type="submit" disabled={available <= 0}
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-emerald-500 px-3 py-2 text-xs font-bold text-black disabled:opacity-50">
            <ArrowDownToLine className="h-3 w-3" /> Withdraw to my seller bank
          </button>
          <p className="text-[10px] text-muted-foreground">Available: <span className="font-bold tabular-nums">{fmt(available)}</span></p>
        </form>
      </Section>

      <Section title="Recent personal orders">
        <OrdersTable rows={orders} />
      </Section>

      <Section title="Personal payout history">
        <PayoutsList rows={payouts} kind="personal" />
      </Section>
    </div>
  );
}

function PayoutsTab({ platform, personal }: { platform: any[]; personal: any[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Section title="Platform payouts" right={<Banknote className="h-3 w-3 text-primary" />}>
        <PayoutsList rows={platform} kind="platform" />
      </Section>
      <Section title="Personal seller payouts" right={<Wallet className="h-3 w-3 text-emerald-500" />}>
        <PayoutsList rows={personal} kind="personal" />
      </Section>
    </div>
  );
}

function PayoutsList({ rows, kind }: { rows: any[]; kind: "platform" | "personal" }) {
  if (!rows || rows.length === 0) return <p className="text-xs text-muted-foreground">No payouts yet.</p>;
  return (
    <ul className="max-h-80 space-y-1 overflow-y-auto text-xs">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center justify-between rounded-md bg-muted/40 px-2 py-1.5">
          <div>
            <div className="font-bold tabular-nums">{fmt(Number(r.amount_cents))}</div>
            <div className="text-[10px] text-muted-foreground">
              {new Date(r.created_at).toLocaleString()}
              {kind === "platform" && r.destination && ` • ${r.destination === "platform_bank" ? "Platform bank" : "→ Personal"}`}
            </div>
          </div>
          <StatusPill status={r.status} />
        </li>
      ))}
    </ul>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    requested: "bg-amber-500/20 text-amber-500",
    processing: "bg-blue-500/20 text-blue-500",
    completed: "bg-emerald-500/20 text-emerald-500",
    failed: "bg-destructive/20 text-destructive",
    canceled: "bg-muted text-muted-foreground",
  };
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${map[status] ?? "bg-muted text-muted-foreground"}`}>{status}</span>;
}

function OrdersTable({ rows }: { rows: any[] }) {
  if (!rows || rows.length === 0) return <p className="text-xs text-muted-foreground">No orders.</p>;
  return (
    <div className="max-h-96 overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-card text-muted-foreground">
          <tr><th className="py-1 text-left">When</th><th className="text-left">Item</th><th className="text-right">Gross</th><th className="text-right">Commission</th><th className="text-right">Net</th></tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id} className="border-t border-border/40">
              <td className="py-1 text-muted-foreground">{new Date(o.created_at).toLocaleDateString()}</td>
              <td className="truncate" title={o.title}>{o.title}</td>
              <td className="text-right tabular-nums">{fmt((Number(o.amount) || 0) * 100)}</td>
              <td className="text-right tabular-nums text-muted-foreground">{fmt((Number(o.commission_amount) || 0) * 100)}</td>
              <td className="text-right font-bold tabular-nums text-emerald-500">{fmt((Number(o.seller_payout_amount) || 0) * 100)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StreamsTab({ rows, loading }: { rows: any[]; loading: boolean }) {
  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <Section title="Stream revenue analytics">
      {rows.length === 0 ? <p className="text-xs text-muted-foreground">No stream sales for this period.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground"><tr><th className="py-1 text-left">Stream</th><th className="text-right">Orders</th><th className="text-right">Gross</th><th className="text-right">Commission</th><th className="text-right">Shipping</th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.stream_id} className="border-t border-border/40">
                  <td className="py-1"><Link to="/live/$id" params={{ id: s.stream_id }} className="font-bold text-primary hover:underline">{s.stream_title ?? s.stream_id.slice(0, 8)}</Link></td>
                  <td className="text-right tabular-nums">{s.order_count}</td>
                  <td className="text-right tabular-nums">{fmt(Number(s.gross_sales_cents))}</td>
                  <td className="text-right tabular-nums text-primary">{fmt(Number(s.commission_cents))}</td>
                  <td className="text-right tabular-nums text-muted-foreground">{fmt(Number(s.shipping_cents))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function SellersTab({ rows, loading }: { rows: any[]; loading: boolean }) {
  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <Section title="Top sellers by commission" right={<Users className="h-3 w-3 text-muted-foreground" />}>
      {rows.length === 0 ? <p className="text-xs text-muted-foreground">No seller activity.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground"><tr><th className="py-1 text-left">Seller</th><th className="text-right">Orders</th><th className="text-right">Gross</th><th className="text-right">Commission</th><th className="text-right">Paid out</th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.seller_id} className="border-t border-border/40">
                  <td className="py-1">{s.username ? <Link to="/seller/$username" params={{ username: s.username }} className="font-bold text-primary hover:underline">@{s.username}</Link> : s.seller_id.slice(0, 8)}</td>
                  <td className="text-right tabular-nums">{s.order_count}</td>
                  <td className="text-right tabular-nums">{fmt(Number(s.gross_sales_cents))}</td>
                  <td className="text-right tabular-nums text-primary">{fmt(Number(s.commission_cents))}</td>
                  <td className="text-right tabular-nums text-muted-foreground">{fmt(Number(s.seller_payout_cents))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function ShippingTab({ overview }: any) {
  if (!overview) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const s = overview.shipping;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat icon={<Truck className="h-3 w-3" />} label="Buyer charged" value={fmt(s.chargedCents)} accent="text-primary" />
        <Stat icon={<TrendingDown className="h-3 w-3" />} label="Label cost" value={fmt(s.labelCostCents)} accent="text-destructive" />
        <Stat icon={<Wallet className="h-3 w-3" />} label="Gross margin" value={fmt(s.grossMarginCents)} accent={s.grossMarginCents >= 0 ? "text-emerald-500" : "text-destructive"} />
        <Stat icon={<TrendingUp className="h-3 w-3" />} label="Adj. fees" value={fmt(s.adjFeesCents)} accent="text-emerald-500" />
        <Stat icon={<TrendingDown className="h-3 w-3" />} label="Adj. losses" value={fmt(s.adjLossesCents)} accent="text-destructive" />
        <Stat icon={<Wallet className="h-3 w-3" />} label="Net margin" value={fmt(s.netMarginCents)} accent={s.netMarginCents >= 0 ? "text-emerald-500" : "text-destructive"} />
      </div>
      <Section title="About shipping revenue">
        <p className="text-xs text-muted-foreground">
          Gross margin = what buyers paid for shipping − what Shippo charged for the labels (recorded per order at purchase time). Net margin also adds adjustment fees recovered and subtracts reissue/correction losses.
        </p>
      </Section>
    </div>

  );
}

function RefundsTab({ ledger, overview }: any) {
  const losses = ledger.filter((r: any) => r.kind === "refund_loss" || r.kind === "dispute_loss");
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Stat icon={<AlertTriangle className="h-3 w-3" />} label="Refund losses" value={fmt(overview?.byKind?.refund_loss?.total_cents ?? 0)} accent="text-destructive" />
        <Stat icon={<AlertTriangle className="h-3 w-3" />} label="Dispute losses" value={fmt(overview?.byKind?.dispute_loss?.total_cents ?? 0)} accent="text-destructive" />
      </div>
      <Section title="Loss events">
        {losses.length === 0 ? <p className="text-xs text-muted-foreground">No losses in this period.</p> : (
          <ul className="max-h-96 space-y-1 overflow-y-auto text-xs">
            {losses.map((r: any) => (
              <li key={r.id} className="flex items-center justify-between rounded-md bg-muted/40 px-2 py-1.5">
                <div>
                  <div className="font-bold">{KIND_LABEL[r.kind] ?? r.kind}</div>
                  <div className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleString()}{r.notes && ` • ${r.notes}`}</div>
                </div>
                <span className="font-bold tabular-nums text-destructive">{fmt(Number(r.amount_cents))}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function TransactionsTab({ orders, ledger }: { orders: any[]; ledger: any[] }) {
  return (
    <div className="space-y-3">
      <Section title="Recent revenue events" right={<Receipt className="h-3 w-3 text-muted-foreground" />}>
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card text-muted-foreground"><tr><th className="py-1 text-left">When</th><th className="text-left">Kind</th><th className="text-right">Amount</th></tr></thead>
            <tbody>
              {ledger.map((r) => (
                <tr key={r.id} className="border-t border-border/40">
                  <td className="py-1 text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                  <td>{KIND_LABEL[r.kind] ?? r.kind}</td>
                  <td className={`text-right font-bold tabular-nums ${Number(r.amount_cents) < 0 ? "text-destructive" : ""}`}>{fmt(Number(r.amount_cents))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <Section title="Recent personal orders" right={<ShoppingBag className="h-3 w-3 text-muted-foreground" />}>
        <OrdersTable rows={orders} />
      </Section>
    </div>
  );
}

// ---------- Integrity tab ----------
function IntegrityTab() {
  const runFn = useServerFn(runIntegrityReconciliationFn);
  const stripeFn = useServerFn(runStripeReconciliationFn);
  const listFn = useServerFn(listIntegrityAlertsFn);
  const resolveFn = useServerFn(resolveIntegrityAlertFn);
  const qc = useQueryClient();
  const [onlyUnresolved, setOnlyUnresolved] = useState(true);
  const [running, setRunning] = useState(false);
  const [runningStripe, setRunningStripe] = useState(false);

  const alerts = useQuery({
    queryKey: ["integrity-alerts", onlyUnresolved],
    queryFn: () => listFn({ data: { limit: 100, onlyUnresolved } }),
  });

  const runScan = async () => {
    setRunning(true);
    try {
      const r = await runFn({ data: { sinceDays: 30 } });
      toast.success(
        `Scanned ${r.scannedOrders} orders · ${r.newAlerts} new alert${r.newAlerts === 1 ? "" : "s"}`,
      );
      qc.invalidateQueries({ queryKey: ["integrity-alerts"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Reconciliation failed");
    } finally {
      setRunning(false);
    }
  };

  const runStripeScan = async () => {
    setRunningStripe(true);
    try {
      const r = await stripeFn({ data: { sinceDays: 7, limit: 200 } });
      toast.success(
        `Stripe: ${r.checked}/${r.scanned} charges checked · ${r.newAlerts} new · ${r.errors} errors`,
      );
      qc.invalidateQueries({ queryKey: ["integrity-alerts"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Stripe reconciliation failed");
    } finally {
      setRunningStripe(false);
    }
  };

  const resolve = async (id: string) => {
    try {
      await resolveFn({ data: { alertId: id } });
      qc.invalidateQueries({ queryKey: ["integrity-alerts"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  };

  const rows = (alerts.data?.rows ?? []) as any[];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={runScan}
          disabled={running}
          className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50"
        >
          <RefreshCcw className={`h-3 w-3 ${running ? "animate-spin" : ""}`} /> Run reconciliation
        </button>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={onlyUnresolved}
            onChange={(e) => setOnlyUnresolved(e.target.checked)}
            className="h-3 w-3"
          />
          Only unresolved
        </label>
        <span className="ml-auto text-[10px] text-muted-foreground">
          Nightly auto-scan at 03:15 UTC. Insert/update triggers also block bad writes in real time.
        </span>
      </div>

      <Section title={`Alerts (${rows.length})`} right={<AlertTriangle className="h-3 w-3 text-destructive" />}>
        {alerts.isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">No alerts — books are clean. ✨</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-1 pr-2">When</th>
                  <th className="py-1 pr-2">Severity</th>
                  <th className="py-1 pr-2">Kind</th>
                  <th className="py-1 pr-2">Order</th>
                  <th className="py-1 pr-2 text-right">Amount</th>
                  <th className="py-1 pr-2">Details</th>
                  <th className="py-1 pr-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border/50 align-top">
                    <td className="py-1 pr-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="py-1 pr-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          r.severity === "critical"
                            ? "bg-destructive/15 text-destructive"
                            : r.severity === "warning"
                            ? "bg-amber-500/15 text-amber-600"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {r.severity}
                      </span>
                    </td>
                    <td className="py-1 pr-2 font-mono">{r.kind}</td>
                    <td className="py-1 pr-2 font-mono text-[10px]">{r.order_id?.slice(0, 8) ?? "—"}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{r.amount_cents != null ? fmt(r.amount_cents) : "—"}</td>
                    <td className="py-1 pr-2 text-[10px] text-muted-foreground">
                      <pre className="max-w-xs overflow-x-auto">{JSON.stringify(r.details, null, 0)}</pre>
                    </td>
                    <td className="py-1 pr-2">
                      {r.resolved_at ? (
                        <span className="text-[10px] text-emerald-500">resolved</span>
                      ) : (
                        <button
                          onClick={() => resolve(r.id)}
                          className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold hover:bg-muted/70"
                        >
                          Resolve
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

// ---------- CSV helper ----------
function downloadCsv(filename: string, rows: Record<string, any>[]) {
  if (rows.length === 0) { toast.info("Nothing to export"); return; }
  const cols = Array.from(rows.reduce((s: Set<string>, r) => { Object.keys(r).forEach((k) => s.add(k)); return s; }, new Set<string>()));
  const esc = (v: any) => {
    if (v == null) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ---------- Audit tab (Phase 5) ----------
function AuditTab({ sinceDays }: { sinceDays?: number }) {
  const auditFn = useServerFn(getOrdersAuditFn);
  const [paymentStatus, setPaymentStatus] = useState<string>("paid");
  const [search, setSearch] = useState("");
  const [driftOnly, setDriftOnly] = useState(false);

  const q = useQuery({
    queryKey: ["owner-audit", sinceDays, paymentStatus, search],
    queryFn: () => auditFn({ data: { sinceDays, limit: 300, paymentStatus: paymentStatus || undefined, search: search || undefined } }),
  });

  const rows = (q.data?.rows ?? []) as any[];
  const filtered = driftOnly ? rows.filter((r) => r.hasDrift) : rows;
  const totals = filtered.reduce(
    (acc, r) => {
      acc.subtotal += r.subtotalCents;
      acc.shipping += r.shippingCents;
      acc.commission += r.commissionCents;
      acc.payout += r.payoutCents;
      acc.labelCost += r.labelCostCents;
      acc.shipMargin += r.shippingMarginCents;
      acc.refunded += r.refundedCents;
      if (r.hasDrift) acc.driftCount += 1;
      return acc;
    },
    { subtotal: 0, shipping: 0, commission: 0, payout: 0, labelCost: 0, shipMargin: 0, refunded: 0, driftCount: 0 },
  );

  const exportCsv = () => {
    downloadCsv(
      `audit-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((r) => ({
        order_id: r.id,
        created_at: r.created_at,
        paid_at: r.paid_at,
        title: r.title,
        seller_id: r.seller_id,
        buyer_id: r.buyer_id,
        stream_id: r.stream_id,
        payment_status: r.payment_status,
        status: r.status,
        stripe_charge_id: r.stripe_charge_id,
        amount_cents: r.amountCents,
        shipping_cents: r.shippingCents,
        subtotal_cents: r.subtotalCents,
        commission_rate: r.commission_rate,
        commission_cents: r.commissionCents,
        expected_commission_cents: r.expectedCommission,
        commission_drift_cents: r.commissionDrift,
        seller_payout_cents: r.payoutCents,
        expected_payout_cents: r.expectedPayout,
        payout_drift_cents: r.payoutDrift,
        sum_drift_cents: r.sumDrift,
        label_cost_cents: r.labelCostCents,
        shipping_margin_cents: r.shippingMarginCents,
        refunded_cents: r.refundedCents,
        verified_at: r.shipment_verified_at,
      })),
    );
  };

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={paymentStatus}
          onChange={(e) => setPaymentStatus(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
        >
          <option value="">All payment states</option>
          <option value="paid">Paid</option>
          <option value="awaiting_payment">Awaiting payment</option>
          <option value="refunded">Refunded</option>
          <option value="failed">Failed</option>
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title…"
          maxLength={120}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
        />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={driftOnly} onChange={(e) => setDriftOnly(e.target.checked)} className="h-3 w-3" />
          Only with drift
        </label>
        <button onClick={exportCsv} className="ml-auto inline-flex items-center gap-1 rounded-full bg-foreground px-3 py-1.5 text-xs font-bold text-background">
          <ArrowDownToLine className="h-3 w-3" /> Export CSV
        </button>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <Stat icon={<ShoppingBag className="h-3 w-3" />} label="Orders" value={String(filtered.length)} sub={`${totals.driftCount} w/ drift`} accent={totals.driftCount > 0 ? "text-destructive" : undefined} />
        <Stat icon={<Receipt className="h-3 w-3" />} label="Subtotal" value={fmt(totals.subtotal)} />
        <Stat icon={<TrendingUp className="h-3 w-3" />} label="Commission" value={fmt(totals.commission)} accent="text-primary" />
        <Stat icon={<Wallet className="h-3 w-3" />} label="Seller payout" value={fmt(totals.payout)} accent="text-emerald-500" />
        <Stat icon={<Truck className="h-3 w-3" />} label="Shipping" value={fmt(totals.shipping)} sub={`Label ${fmt(totals.labelCost)}`} />
        <Stat icon={<Wallet className="h-3 w-3" />} label="Ship margin" value={fmt(totals.shipMargin)} accent={totals.shipMargin >= 0 ? "text-emerald-500" : "text-destructive"} />
        <Stat icon={<TrendingDown className="h-3 w-3" />} label="Refunded" value={fmt(totals.refunded)} accent="text-destructive" />
      </div>

      <Section title={`Per-order audit (${filtered.length})`} right={<span className="text-[10px] text-muted-foreground">Drift &gt; $0.02 highlighted</span>}>
        {q.isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground">No orders match the current filters.</p>
        ) : (
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-card text-muted-foreground">
                <tr className="text-left">
                  <th className="py-1 pr-2">When</th>
                  <th className="pr-2">Title</th>
                  <th className="pr-2">Status</th>
                  <th className="pr-2 text-right">Subtotal</th>
                  <th className="pr-2 text-right">Comm</th>
                  <th className="pr-2 text-right">Payout</th>
                  <th className="pr-2 text-right">Ship</th>
                  <th className="pr-2 text-right">Label</th>
                  <th className="pr-2 text-right">Margin</th>
                  <th className="pr-2 text-right">Drift</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className={`border-t border-border/40 ${r.hasDrift ? "bg-destructive/5" : ""}`}>
                    <td className="py-1 pr-2 whitespace-nowrap text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td className="pr-2 max-w-[16ch] truncate" title={r.title}>{r.title}</td>
                    <td className="pr-2"><StatusPill status={r.payment_status} /></td>
                    <td className="pr-2 text-right tabular-nums">{fmt(r.subtotalCents)}</td>
                    <td className="pr-2 text-right tabular-nums text-primary">{fmt(r.commissionCents)}</td>
                    <td className="pr-2 text-right tabular-nums text-emerald-500">{fmt(r.payoutCents)}</td>
                    <td className="pr-2 text-right tabular-nums text-muted-foreground">{fmt(r.shippingCents)}</td>
                    <td className="pr-2 text-right tabular-nums text-muted-foreground">{fmt(r.labelCostCents)}</td>
                    <td className={`pr-2 text-right tabular-nums ${r.shippingMarginCents >= 0 ? "text-emerald-500" : "text-destructive"}`}>{fmt(r.shippingMarginCents)}</td>
                    <td className={`pr-2 text-right tabular-nums font-bold ${r.hasDrift ? "text-destructive" : "text-muted-foreground"}`}>
                      {r.hasDrift ? fmt(r.sumDrift || r.commissionDrift || r.payoutDrift) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
