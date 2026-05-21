import { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Download, ChevronRight, AlertTriangle, Wallet, Clock, CheckCircle2, ArrowDownToLine, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { requestPayoutFn, getSellerPayableFn, getSellerTrustFn } from "@/lib/payouts.functions";
import { TrustTierCard, type TrustTier } from "@/components/TrustTierCard";

const PLATFORM_FEE = 0.05;            // 5%
const PROCESSING_RATE = 0.029;        // 2.9%
const PROCESSING_FIXED = 0.30;        // $0.30
const MIN_PAYOUT = 5;                 // $5 minimum
const PAYOUT_ETA_BIZ_DAYS = "1–2 business days";

type Order = {
  id: string;
  title: string;
  amount: number;                     // gross $
  buyer_id: string;
  seller_id: string;
  status: string;
  payment_status?: string;
  refunded_amount?: number | null;
  shipping_cents?: number | null;     // optional, future
  promo_cents?: number | null;        // optional, future
  commission_rate?: number | null;
  created_at: string;
  fee_absorbed_by?: "buyer" | "seller" | null;
  fee_index?: number | null;
};

type Recovery = {
  id: string;
  source: string;
  gross_cents: number;
  deducted_cents: number;
  net_released_cents: number;
  remaining_owed_cents: number;
  created_at: string;
  reference_id: string | null;
};

type Hold = { id: string; balance_owed_cents: number };

type ProfileRow = {
  id: string;
  username: string | null;
};

const fmt = (n: number) => `$${n.toFixed(2)}`;

const BUYER_PLATFORM_FEE_DOLLARS = 1.23;

function computeBreakdown(o: Order, recoveryByRef: Map<string, number>) {
  const gross = Number(o.amount || 0);
  const platformFee = gross * Number(o.commission_rate ?? PLATFORM_FEE);
  const processingFee = gross > 0 ? gross * PROCESSING_RATE + PROCESSING_FIXED : 0;
  const shipping = (o.shipping_cents ?? 0) / 100;
  const promo = (o.promo_cents ?? 0) / 100;
  const refund = Number(o.refunded_amount ?? 0);
  const recovery = (recoveryByRef.get(o.id) ?? 0) / 100;
  // Bundle: when buyer's platform fee was waived (item 4+ in a stream session),
  // the seller absorbs ~$1.23 via a larger application fee on Stripe.
  const bundleAbsorbed = o.fee_absorbed_by === "seller" ? BUYER_PLATFORM_FEE_DOLLARS : 0;
  const totalDeductions = platformFee + processingFee + shipping + promo + refund + recovery + bundleAbsorbed;
  const net = Math.max(0, gross - totalDeductions);
  return { gross, platformFee, processingFee, shipping, promo, refund, recovery, bundleAbsorbed, totalDeductions, net };
}

type PayoutRequest = {
  id: string;
  amount_cents: number;
  status: "requested" | "processing" | "completed" | "failed" | "canceled";
  created_at: string;
  completed_at: string | null;
  failure_reason: string | null;
};

export function SellerEarningsHub({ orders }: { orders: Order[] }) {
  const { user } = useAuth();
  const [recoveries, setRecoveries] = useState<Recovery[]>([]);
  const [hold, setHold] = useState<Hold | null>(null);
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [buyerNames, setBuyerNames] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<"summary" | "orders" | "history">("summary");
  const [open, setOpen] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverPayable, setServerPayable] = useState<{
    available_cents: number; pending_cents: number; locked_cents: number;
    in_flight_cents: number; owed_cents: number; payable_cents: number;
    instant_pct: number; tier: TrustTier; frozen: boolean;
  } | null>(null);
  const [trust, setTrust] = useState<{ completed_deliveries: number; manual_override_pct: number | null } | null>(null);
  const requestPayoutCall = useServerFn(requestPayoutFn);
  const getPayable = useServerFn(getSellerPayableFn);
  const getTrust = useServerFn(getSellerTrustFn);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: recs }, { data: h }, { data: po }] = await Promise.all([
      supabase
        .from("hold_recoveries" as any)
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("account_holds" as any)
        .select("id,balance_owed_cents")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle(),
      supabase
        .from("payout_requests" as any)
        .select("id,amount_cents,status,created_at,completed_at,failure_reason")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    setRecoveries((recs as any) ?? []);
    setHold((h as any) ?? null);
    setPayouts((po as any) ?? []);
    try {
      const [p, t] = await Promise.all([getPayable({}), getTrust({})]);
      setServerPayable(p as any);
      setTrust(t as any);
    } catch { /* non-fatal — fall back to client math */ }
  }, [user, getPayable, getTrust]);

  useEffect(() => { load(); }, [load]);

  // Realtime: refresh balances whenever a payout/hold/recovery row changes
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`earnings-${user.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "payout_requests", filter: `user_id=eq.${user.id}` },
        () => load())
      .on("postgres_changes",
        { event: "*", schema: "public", table: "account_holds", filter: `user_id=eq.${user.id}` },
        () => load())
      .on("postgres_changes",
        { event: "*", schema: "public", table: "hold_recoveries", filter: `user_id=eq.${user.id}` },
        () => load())
      .on("postgres_changes",
        { event: "*", schema: "public", table: "seller_trust", filter: `user_id=eq.${user.id}` },
        () => load())
      .on("postgres_changes",
        { event: "*", schema: "public", table: "payout_locks", filter: `user_id=eq.${user.id}` },
        () => load())
      .on("postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `seller_id=eq.${user.id}` },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, load]);

  // Load buyer usernames
  useEffect(() => {
    const ids = Array.from(new Set(orders.map((o) => o.buyer_id))).filter(Boolean);
    if (ids.length === 0) return;
    supabase.from("profiles").select("id,username").in("id", ids).then(({ data }) => {
      const map: Record<string, string> = {};
      ((data as ProfileRow[]) ?? []).forEach((p) => { if (p.username) map[p.id] = p.username; });
      setBuyerNames(map);
    });
  }, [orders]);

  const recoveryByRef = useMemo(() => {
    const m = new Map<string, number>();
    recoveries.forEach((r) => {
      if (r.reference_id) m.set(r.reference_id, (m.get(r.reference_id) ?? 0) + r.deducted_cents);
    });
    return m;
  }, [recoveries]);

  const breakdowns = useMemo(
    () => orders.map((o) => ({ order: o, ...computeBreakdown(o, recoveryByRef) })),
    [orders, recoveryByRef],
  );

  const processingPayoutCents = useMemo(
    () => payouts
      .filter((p) => p.status === "requested" || p.status === "processing")
      .reduce((s, p) => s + p.amount_cents, 0),
    [payouts],
  );

  const totals = useMemo(() => {
    let gross = 0, platformFee = 0, processingFee = 0, shipping = 0, promo = 0, refund = 0, recovery = 0, bundleAbsorbed = 0, net = 0;
    let available = 0, pending = 0, processing = 0, completed = 0;
    breakdowns.forEach(({ order, ...b }) => {
      gross += b.gross; platformFee += b.platformFee; processingFee += b.processingFee;
      shipping += b.shipping; promo += b.promo; refund += b.refund; recovery += b.recovery;
      bundleAbsorbed += b.bundleAbsorbed; net += b.net;
      const paid = order.payment_status === "paid";
      if (paid && order.status === "delivered") available += b.net;
      else if (paid && (order.status === "pending" || order.status === "shipped")) pending += b.net;
      if (paid && order.status === "shipped") processing += b.net;
      if (order.status === "delivered") completed += b.net;
    });
    const owed = (hold?.balance_owed_cents ?? 0) / 100;
    const processingPayout = processingPayoutCents / 100;
    const available_after = Math.max(0, available - processingPayout);
    const payable = Math.max(0, available_after - owed);
    const totalEarnings = available_after + pending + processingPayout;
    return { gross, platformFee, processingFee, shipping, promo, refund, recovery, bundleAbsorbed, net,
             available: available_after, pending, processing, completed, owed, payable,
             processingPayout, totalEarnings };
  }, [breakdowns, hold, processingPayoutCents]);

  function downloadCsv() {
    const rows = [
      ["Date","Order ID","Item","Buyer","Gross","Platform fee","Processing","Shipping","Promo","Refund","Hold recovery","Net","Status"],
      ...breakdowns.map(({ order, ...b }) => [
        new Date(order.created_at).toISOString(),
        order.id,
        order.title,
        buyerNames[order.buyer_id] ?? order.buyer_id,
        b.gross.toFixed(2), b.platformFee.toFixed(2), b.processingFee.toFixed(2),
        b.shipping.toFixed(2), b.promo.toFixed(2), b.refund.toFixed(2), b.recovery.toFixed(2),
        b.net.toFixed(2), order.status,
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `earnings-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  const hasInflightPayout = totals.processingPayout > 0;
  // Server-validated payable wins over client math when available
  const displayPayable = serverPayable ? serverPayable.payable_cents / 100 : totals.payable;
  const lockedAmount = serverPayable ? serverPayable.locked_cents / 100 : 0;
  const isFrozen = !!serverPayable?.frozen;

  async function requestPayout() {
    if (hasInflightPayout) {
      toast.error("A payout is already in progress. Please wait for it to complete.");
      return;
    }
    if (isFrozen) {
      toast.error("Account is frozen by platform review. Contact support.");
      return;
    }
    if (displayPayable < MIN_PAYOUT) {
      toast.error(`Minimum payout is ${fmt(MIN_PAYOUT)}.`);
      return;
    }
    if (hold && !confirm(`${fmt(totals.owed)} owed will be deducted automatically before release. Continue?`)) {
      return;
    }
    setSubmitting(true);
    try {
      // Re-fetch server payable to avoid stale client state
      const fresh = await getPayable({});
      setServerPayable(fresh as any);
      const cents = (fresh as any).payable_cents as number;
      if (cents < MIN_PAYOUT * 100) {
        toast.error(`Available balance changed. Minimum payout is ${fmt(MIN_PAYOUT)}.`);
        return;
      }
      await requestPayoutCall({ data: { amountCents: cents } });
      toast.success(`Payout of ${fmt(cents/100)} is now processing — ETA ${PAYOUT_ETA_BIZ_DAYS}.`);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Could not start payout");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Combined total — front and center */}
      <div className="rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 p-4">
        <p className="text-[11px] uppercase text-muted-foreground">Total earnings</p>
        <p className="text-3xl font-bold text-primary">
          {fmt(serverPayable
            ? (serverPayable.available_cents + serverPayable.pending_cents + serverPayable.in_flight_cents) / 100
            : totals.totalEarnings)}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Available + pending + processing payout
        </p>
      </div>

      {/* Trust tier card */}
      {serverPayable && (
        <TrustTierCard
          tier={serverPayable.tier}
          deliveries={trust?.completed_deliveries ?? 0}
          instantPct={serverPayable.instant_pct}
          frozen={serverPayable.frozen}
          manualOverride={trust?.manual_override_pct != null}
        />
      )}

      {/* Top balance cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <BalanceCard icon={<Wallet className="h-4 w-4" />} label="Available" value={fmt(serverPayable ? serverPayable.available_cents/100 : totals.available)} accent="primary" />
        <BalanceCard icon={<Clock className="h-4 w-4" />} label="Pending" value={fmt(serverPayable ? serverPayable.pending_cents/100 : totals.pending)} />
        <BalanceCard icon={<ArrowDownToLine className="h-4 w-4" />} label="Processing payout" value={fmt(totals.processingPayout)} />
        <BalanceCard icon={<CheckCircle2 className="h-4 w-4" />} label="Completed" value={fmt(totals.completed)} />
      </div>

      {/* In-flight payout banner */}
      {hasInflightPayout && (
        <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <div className="flex-1">
            <strong>{fmt(totals.processingPayout)} processing.</strong> ETA {PAYOUT_ETA_BIZ_DAYS}. Funds will return to Available if the transfer fails.
          </div>
        </div>
      )}

      {/* Locked funds banner */}
      {lockedAmount > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div className="flex-1">
            <strong>{fmt(lockedAmount)} on hold</strong> for orders with disputes, refunds, or unconfirmed delivery. These funds are released once each issue is resolved.
          </div>
        </div>
      )}

      {/* Negative balance warning */}
      {hold && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <strong>{fmt(totals.owed)} owed.</strong> This amount is automatically deducted from future payouts before release.
          </div>
          <Link to="/payouts" className="shrink-0 rounded-full bg-destructive px-3 py-1 text-[11px] font-bold text-destructive-foreground">
            Pay now
          </Link>
        </div>
      )}

      {/* Request payout — front and center */}
      <div className="rounded-xl bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase text-muted-foreground">Available to withdraw</p>
            <p className="text-2xl font-bold text-primary">{fmt(displayPayable)}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              ETA {PAYOUT_ETA_BIZ_DAYS} · min {fmt(MIN_PAYOUT)} {hold ? `· ${fmt(totals.owed)} will be deducted` : ""}
            </p>
          </div>
          <button
            onClick={requestPayout}
            disabled={submitting || hasInflightPayout || isFrozen || displayPayable < MIN_PAYOUT}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isFrozen ? "Account frozen" : hasInflightPayout ? "Payout in progress" : "Request payout"}
          </button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2">
        {(["summary","orders","history"] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize ${tab === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            {k === "history" ? "Payout history" : k}
          </button>
        ))}
        <button onClick={downloadCsv} className="ml-auto inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold">
          <Download className="h-3 w-3" /> CSV
        </button>
      </div>

      {/* SUMMARY */}
      {tab === "summary" && (
        <div className="space-y-1.5">
          <Row label="Gross sales" value={fmt(totals.gross)} />
          <Row label="Platform fee" value={`−${fmt(totals.platformFee)}`} negative />
          <Row label="Payment processing" value={`−${fmt(totals.processingFee)}`} negative />
          <Row label="Shipping / labels" value={`−${fmt(totals.shipping)}`} negative />
          <Row label="Promotions / shoutouts" value={`−${fmt(totals.promo)}`} negative />
          <Row label="Refunds" value={`−${fmt(totals.refund)}`} negative />
          <Row label="Negative balance recovery" value={`−${fmt(totals.recovery)}`} negative />
          {totals.bundleAbsorbed > 0 && (
            <Row label="Bundle fees absorbed (buyer ≥4 items/stream)" value={`−${fmt(totals.bundleAbsorbed)}`} negative />
          )}
          <Row label="Final net earnings" value={fmt(totals.net)} primary />
          <p className="px-1 pt-1 text-[11px] text-muted-foreground">
            Processing estimated at 2.9% + $0.30 per sale. Tax forms (1099-K) issued at year-end if you exceed reporting thresholds.
          </p>
        </div>
      )}

      {/* PER-ORDER */}
      {tab === "orders" && (
        <div className="space-y-1.5">
          {breakdowns.length === 0 && <p className="text-xs text-muted-foreground">No sales yet.</p>}
          {breakdowns.map(({ order, ...b }) => {
            const isOpen = open === order.id;
            return (
              <div key={order.id} className="rounded-xl bg-card text-xs">
                <button onClick={() => setOpen(isOpen ? null : order.id)} className="flex w-full items-center justify-between gap-2 p-3">
                  <div className="min-w-0 flex-1 text-left">
                    <p className="truncate font-bold">{order.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      @{buyerNames[order.buyer_id] ?? "buyer"} · {new Date(order.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-primary">{fmt(b.net)}</p>
                    <p className="text-[10px] text-muted-foreground capitalize">{order.status}</p>
                  </div>
                  <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                </button>
                {isOpen && (
                  <div className="space-y-1 border-t border-border px-3 py-2">
                    <Row small label="Gross" value={fmt(b.gross)} />
                    <Row small label="Platform fee" value={`−${fmt(b.platformFee)}`} negative />
                    <Row small label="Processing" value={`−${fmt(b.processingFee)}`} negative />
                    {b.shipping > 0 && <Row small label="Shipping" value={`−${fmt(b.shipping)}`} negative />}
                    {b.promo > 0 && <Row small label="Promo" value={`−${fmt(b.promo)}`} negative />}
                    {b.refund > 0 && <Row small label="Refund" value={`−${fmt(b.refund)}`} negative />}
                    {b.recovery > 0 && <Row small label="Hold recovery" value={`−${fmt(b.recovery)}`} negative />}
                    <Row small label="Total deductions" value={`−${fmt(b.totalDeductions)}`} negative />
                    <Row small label="Net to you" value={fmt(b.net)} primary />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* PAYOUT HISTORY */}
      {tab === "history" && (
        <div className="space-y-1.5">
          {recoveries.length === 0 && <p className="text-xs text-muted-foreground">No automatic deductions yet.</p>}
          {recoveries.map((r) => (
            <div key={r.id} className="rounded-xl bg-card p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold capitalize">{r.source}</span>
                <span className="text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
              </div>
              <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] sm:grid-cols-4">
                <div><span className="text-muted-foreground">Earned</span><div className="font-bold">{fmt(r.gross_cents/100)}</div></div>
                <div><span className="text-muted-foreground">Deducted</span><div className="font-bold text-destructive">−{fmt(r.deducted_cents/100)}</div></div>
                <div><span className="text-muted-foreground">Released</span><div className="font-bold text-emerald-500">{fmt(r.net_released_cents/100)}</div></div>
                <div><span className="text-muted-foreground">Still owed</span><div className="font-bold">{fmt(r.remaining_owed_cents/100)}</div></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BalanceCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: "primary" }) {
  return (
    <div className="rounded-xl bg-card p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase text-muted-foreground">{icon}{label}</div>
      <p className={`mt-1 text-lg font-bold ${accent === "primary" ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}

function Row({ label, value, negative, primary, small }: { label: string; value: string; negative?: boolean; primary?: boolean; small?: boolean }) {
  return (
    <div className={`flex items-center justify-between rounded-lg bg-card px-3 ${small ? "py-1.5 text-[11px]" : "py-2.5 text-xs"}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-bold ${primary ? "text-primary" : negative ? "text-destructive" : ""}`}>{value}</span>
    </div>
  );
}
