import { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Download, ChevronRight, AlertTriangle, Wallet, Clock, CheckCircle2, ArrowDownToLine,
  Loader2, DollarSign, TrendingUp, Hourglass, RotateCcw, XCircle, ShieldAlert, Lock, X,
} from "lucide-react";
import { toast } from "sonner";
import { requestPayoutFn, getSellerPayableFn, getSellerTrustFn } from "@/lib/payouts.functions";
import { TrustTierCard, type TrustTier } from "@/components/TrustTierCard";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const PLATFORM_FEE = 0.05;
const PROCESSING_RATE = 0.029;
const PROCESSING_FIXED = 0.30;
const MIN_PAYOUT = 5;
const PAYOUT_ETA_BIZ_DAYS = "1–2 business days";
// Days after delivery before an order moves to "Completed" (refund window closed)
const COMPLETION_WINDOW_DAYS = 14;

type Order = {
  id: string;
  title: string;
  amount: number;
  shipping_amount?: number | null;
  seller_payout_amount?: number | null;
  buyer_id: string;
  seller_id: string;
  status: string;
  payment_status?: string;
  refunded_amount?: number | null;
  refunded_at?: string | null;
  shipping_cents?: number | null;
  promo_cents?: number | null;
  commission_rate?: number | null;
  created_at: string;
  shipped_at?: string | null;
  delivered_at?: string | null;
  fee_absorbed_by?: "buyer" | "seller" | null;
  fee_index?: number | null;
  stream_id?: string | null;
  platform_fee_cents?: number | null;
  seller_processing_fee_cents?: number | null;
  processing_fee_cents?: number | null;
  fee_split_mode?: "buyer" | "split" | "seller_absorbed" | null;
  ship_name?: string | null;
  ship_address?: string | null;
  ship_city?: string | null;
  ship_state?: string | null;
  ship_zip?: string | null;
  ship_country?: string | null;
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
type ProfileRow = { id: string; username: string | null; full_name?: string | null };

const fmt = (n: number) => `$${n.toFixed(2)}`;

// ---------- Lifecycle status ----------
type Lifecycle =
  | "Awaiting Payment" | "Payment Authorized" | "Paid" | "Pending Shipment"
  | "Label Created" | "Shipped" | "Delivered" | "Completed"
  | "Refund Pending" | "Refund Approved" | "Partial Refund" | "Refund Denied"
  | "Cancellation Pending" | "Cancelled"
  | "Chargeback Open" | "Chargeback Lost" | "Admin Review";

function getLifecycle(o: Order): Lifecycle {
  const ps = (o.payment_status || "").toLowerCase();
  const s = (o.status || "").toLowerCase();
  if (s === "cancelled" || ps === "cancelled") return "Cancelled";
  if (s === "cancellation_pending" || ps === "cancellation_pending") return "Cancellation Pending";
  if (ps === "chargeback_lost" || s === "chargeback_lost") return "Chargeback Lost";
  if (ps === "disputed" || ps === "chargeback_open" || s === "disputed") return "Chargeback Open";
  if (s === "admin_review" || ps === "admin_review") return "Admin Review";
  if (ps === "refunded") return "Refund Approved";
  if (ps === "refund_pending" || s === "refund_pending") return "Refund Pending";
  if (ps === "refund_denied") return "Refund Denied";
  const refunded = Number(o.refunded_amount || 0);
  if (refunded > 0 && refunded < Number(o.amount || 0)) return "Partial Refund";
  if (ps === "awaiting_payment") return "Awaiting Payment";
  if (ps === "authorized") return "Payment Authorized";
  if (s === "delivered") {
    const dAt = o.delivered_at ? +new Date(o.delivered_at) : 0;
    const windowMs = COMPLETION_WINDOW_DAYS * 86400000;
    if (dAt && Date.now() - dAt > windowMs && refunded === 0) return "Completed";
    return "Delivered";
  }
  if (s === "shipped") return "Shipped";
  if (s === "label_created") return "Label Created";
  if (ps === "paid" && (s === "pending" || s === "paid" || !s)) return "Pending Shipment";
  if (ps === "paid") return "Paid";
  return "Paid";
}

const LIFECYCLE_COLORS: Record<Lifecycle, string> = {
  "Awaiting Payment": "bg-muted text-muted-foreground",
  "Payment Authorized": "bg-blue-500/15 text-blue-300",
  "Paid": "bg-blue-500/15 text-blue-300",
  "Pending Shipment": "bg-amber-500/15 text-amber-300",
  "Label Created": "bg-amber-500/15 text-amber-300",
  "Shipped": "bg-indigo-500/15 text-indigo-300",
  "Delivered": "bg-emerald-500/15 text-emerald-400",
  "Completed": "bg-emerald-600/20 text-emerald-300",
  "Refund Pending": "bg-amber-500/15 text-amber-300",
  "Refund Approved": "bg-amber-500/20 text-amber-300",
  "Partial Refund": "bg-amber-500/15 text-amber-300",
  "Refund Denied": "bg-muted text-muted-foreground",
  "Cancellation Pending": "bg-amber-500/15 text-amber-300",
  "Cancelled": "bg-destructive/15 text-destructive",
  "Chargeback Open": "bg-destructive/15 text-destructive",
  "Chargeback Lost": "bg-destructive/20 text-destructive",
  "Admin Review": "bg-purple-500/15 text-purple-300",
};

// Excluded from earnings totals; kept forever for record-keeping.
function isArchivedOrder(o: Pick<Order, "status" | "payment_status">) {
  return o.status === "cancelled"
    || o.payment_status === "cancelled"
    || o.payment_status === "refunded"
    || o.payment_status === "awaiting_payment";
}

function computeBreakdown(o: Order, recoveryByRef: Map<string, number>) {
  const totalChargedForOrder = Number(o.amount || 0);
  const shipping = Number(o.shipping_amount ?? 0) || (o.shipping_cents ?? 0) / 100;
  const gross = Math.max(0, totalChargedForOrder - shipping);
  const platformFee = o.platform_fee_cents != null
    ? o.platform_fee_cents / 100
    : gross * Number(o.commission_rate ?? PLATFORM_FEE);
  const isLiveSale = !!o.stream_id;
  const fullProcessingFee = gross > 0 ? gross * PROCESSING_RATE + PROCESSING_FIXED : 0;
  const processingFee = o.seller_processing_fee_cents != null
    ? o.seller_processing_fee_cents / 100
    : isLiveSale ? fullProcessingFee / 2 : 0;
  const promo = (o.promo_cents ?? 0) / 100;
  const refund = Number(o.refunded_amount ?? 0);
  const recovery = (recoveryByRef.get(o.id) ?? 0) / 100;
  const totalDeductions = platformFee + processingFee + shipping + promo + refund + recovery;
  const net = o.seller_payout_amount != null
    ? Math.max(0, Number(o.seller_payout_amount) - refund - recovery)
    : Math.max(0, gross - platformFee - processingFee - refund - recovery);
  return { gross, platformFee, processingFee, shipping, promo, refund, recovery, totalDeductions, net };
}

type PayoutRequest = {
  id: string;
  amount_cents: number;
  status: "requested" | "processing" | "completed" | "failed" | "canceled";
  created_at: string;
  completed_at: string | null;
  failure_reason: string | null;
};

// ============================ MAIN ============================
export function SellerEarningsHub({ orders }: { orders: Order[] }) {
  const { user } = useAuth();
  const [recoveries, setRecoveries] = useState<Recovery[]>([]);
  const [hold, setHold] = useState<Hold | null>(null);
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [buyerNames, setBuyerNames] = useState<Record<string, { u: string; d: string }>>({});
  const [tab, setTab] = useState<"financials" | "orders" | "archive" | "history">("financials");
  const [isStaff, setIsStaff] = useState(false);
  const [openOrder, setOpenOrder] = useState<string | null>(null);
  const [drillCategory, setDrillCategory] = useState<CategoryKey | null>(null);
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

  useEffect(() => {
    if (!user) { setIsStaff(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      if (cancelled) return;
      const set = new Set(((data ?? []) as any[]).map((r) => r.role));
      setIsStaff(set.has("admin") || set.has("owner"));
    })();
    return () => { cancelled = true; };
  }, [user]);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: recs }, { data: h }, { data: po }] = await Promise.all([
      supabase.from("hold_recoveries" as any).select("*").eq("user_id", user.id)
        .order("created_at", { ascending: false }).limit(100),
      supabase.from("account_holds" as any).select("id,balance_owed_cents")
        .eq("user_id", user.id).eq("status", "active").maybeSingle(),
      supabase.from("payout_requests" as any)
        .select("id,amount_cents,status,created_at,completed_at,failure_reason")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
    ]);
    setRecoveries((recs as any) ?? []);
    setHold((h as any) ?? null);
    setPayouts((po as any) ?? []);
    try {
      const [p, t] = await Promise.all([getPayable({}), getTrust({})]);
      setServerPayable(p as any);
      setTrust(t as any);
    } catch { /* fall back to client math */ }
  }, [user, getPayable, getTrust]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`earnings-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "payout_requests", filter: `user_id=eq.${user.id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "account_holds", filter: `user_id=eq.${user.id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "hold_recoveries", filter: `user_id=eq.${user.id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "seller_trust", filter: `user_id=eq.${user.id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "payout_locks", filter: `user_id=eq.${user.id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `seller_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, load]);

  useEffect(() => {
    const ids = Array.from(new Set(orders.map((o) => o.buyer_id))).filter(Boolean);
    if (ids.length === 0) return;
    supabase.from("profiles").select("id,username,full_name").in("id", ids).then(({ data }) => {
      const map: Record<string, { u: string; d: string }> = {};
      ((data as ProfileRow[]) ?? []).forEach((p) => {
        map[p.id] = { u: p.username || "buyer", d: p.full_name || p.username || "Buyer" };
      });
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

  const activeOrders = useMemo(() => orders.filter((o) => !isArchivedOrder(o)), [orders]);
  const archivedOrders = useMemo(
    () => orders.filter(isArchivedOrder).sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)),
    [orders],
  );

  const breakdowns = useMemo(
    () => activeOrders.map((o) => ({ order: o, ...computeBreakdown(o, recoveryByRef) })),
    [activeOrders, recoveryByRef],
  );

  // Map full breakdown back by order id for modal use
  const breakdownById = useMemo(() => {
    const m = new Map<string, ReturnType<typeof computeBreakdown>>();
    [...activeOrders, ...archivedOrders].forEach((o) => m.set(o.id, computeBreakdown(o, recoveryByRef)));
    return m;
  }, [activeOrders, archivedOrders, recoveryByRef]);

  const processingPayoutCents = useMemo(
    () => payouts.filter((p) => p.status === "requested" || p.status === "processing")
      .reduce((s, p) => s + p.amount_cents, 0),
    [payouts],
  );

  const totals = useMemo(() => {
    let gross = 0, platformFee = 0, processingFee = 0, shipping = 0, promo = 0, refund = 0, recovery = 0, net = 0;
    breakdowns.forEach((b) => {
      gross += b.gross; platformFee += b.platformFee; processingFee += b.processingFee;
      shipping += b.shipping; promo += b.promo; refund += b.refund; recovery += b.recovery; net += b.net;
    });
    const owed = (hold?.balance_owed_cents ?? 0) / 100;
    const processingPayout = processingPayoutCents / 100;
    const available = serverPayable ? serverPayable.available_cents / 100 : 0;
    const pending = serverPayable ? serverPayable.pending_cents / 100 : 0;
    const locked = serverPayable ? serverPayable.locked_cents / 100 : 0;
    return { gross, platformFee, processingFee, shipping, promo, refund, recovery, net,
             available, pending, locked, owed, processingPayout };
  }, [breakdowns, hold, processingPayoutCents, serverPayable]);

  // ----- Build category buckets -----
  const buckets = useMemo(() => {
    const all = [...activeOrders, ...archivedOrders];
    const refundsList = all.filter((o) => Number(o.refunded_amount || 0) > 0 || o.payment_status === "refunded");
    const cancelsList = all.filter((o) => o.status === "cancelled" || o.payment_status === "cancelled");
    const awaitingList = all.filter((o) => o.payment_status === "awaiting_payment");
    const disputesList = all.filter((o) => {
      const lc = getLifecycle(o);
      return lc === "Chargeback Open" || lc === "Chargeback Lost" || lc === "Admin Review";
    });
    return {
      gross: { orders: activeOrders, value: totals.gross },
      net: { orders: activeOrders, value: totals.net },
      available: { orders: [], value: totals.available },
      pending_payout: { orders: [], value: totals.processingPayout },
      awaiting_payment: { orders: awaitingList, value: awaitingList.reduce((s, o) => s + Number(o.amount || 0), 0) },
      refunds: { orders: refundsList, value: refundsList.reduce((s, o) => s + Number(o.refunded_amount || 0), 0) },
      cancellations: { orders: cancelsList, value: cancelsList.reduce((s, o) => s + Number(o.amount || 0), 0) },
      disputes: { orders: disputesList, value: disputesList.reduce((s, o) => s + Number(o.amount || 0), 0) },
      reserve: { orders: [], value: totals.locked },
    } as Record<CategoryKey, { orders: Order[]; value: number }>;
  }, [activeOrders, archivedOrders, totals]);

  function downloadCsv() {
    const rows = [
      ["Date","Order ID","Item","Buyer","Gross","Platform fee","Processing","Shipping","Promo","Refund","Hold recovery","Net","Lifecycle"],
      ...breakdowns.map(({ order, ...b }) => [
        new Date(order.created_at).toISOString(), order.id, order.title,
        buyerNames[order.buyer_id]?.u ?? order.buyer_id,
        b.gross.toFixed(2), b.platformFee.toFixed(2), b.processingFee.toFixed(2),
        b.shipping.toFixed(2), b.promo.toFixed(2), b.refund.toFixed(2), b.recovery.toFixed(2),
        b.net.toFixed(2), getLifecycle(order),
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
  const displayPayable = serverPayable ? serverPayable.payable_cents / 100 : 0;
  const isFrozen = !!serverPayable?.frozen;

  async function requestPayout() {
    if (hasInflightPayout) { toast.error("A payout is already in progress."); return; }
    if (isFrozen) { toast.error("Account is frozen. Contact support."); return; }
    if (displayPayable < MIN_PAYOUT) { toast.error(`Minimum payout is ${fmt(MIN_PAYOUT)}.`); return; }
    if (hold && !confirm(`${fmt(totals.owed)} owed will be deducted before release. Continue?`)) return;
    setSubmitting(true);
    try {
      const fresh = await getPayable({});
      setServerPayable(fresh as any);
      const cents = (fresh as any).payable_cents as number;
      if (cents < MIN_PAYOUT * 100) { toast.error(`Balance changed. Min payout ${fmt(MIN_PAYOUT)}.`); return; }
      await requestPayoutCall({ data: { amountCents: cents } });
      toast.success(`Payout of ${fmt(cents/100)} processing — ETA ${PAYOUT_ETA_BIZ_DAYS}.`);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Could not start payout");
    } finally { setSubmitting(false); }
  }

  return (
    <div className="space-y-3">
      {/* Hero: Available to withdraw */}
      <div className="rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 p-4">
        <p className="text-[11px] uppercase text-muted-foreground">Available to withdraw</p>
        <p className="text-3xl font-bold text-primary">{fmt(displayPayable)}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          ETA {PAYOUT_ETA_BIZ_DAYS} · min {fmt(MIN_PAYOUT)}
          {hold ? ` · ${fmt(totals.owed)} owed will be auto-deducted` : ""}
        </p>
        <button
          onClick={requestPayout}
          disabled={submitting || hasInflightPayout || isFrozen || displayPayable < MIN_PAYOUT}
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isFrozen ? "Account frozen" : hasInflightPayout ? "Payout in progress" : "Request payout"}
        </button>
      </div>

      {serverPayable && (
        <TrustTierCard
          tier={serverPayable.tier}
          deliveries={trust?.completed_deliveries ?? 0}
          instantPct={serverPayable.instant_pct}
          frozen={serverPayable.frozen}
          manualOverride={trust?.manual_override_pct != null}
        />
      )}

      {hasInflightPayout && (
        <Banner tone="primary" icon={<Loader2 className="h-4 w-4 animate-spin" />}>
          <strong>{fmt(totals.processingPayout)} processing.</strong> ETA {PAYOUT_ETA_BIZ_DAYS}.
        </Banner>
      )}
      {totals.locked > 0 && (
        <Banner tone="amber" icon={<Lock className="h-4 w-4" />}>
          <strong>{fmt(totals.locked)} on hold</strong> — pending delivery confirmation, dispute resolution, or open refund.
        </Banner>
      )}
      {hold && (
        <Banner tone="destructive" icon={<AlertTriangle className="h-4 w-4" />}
          action={<Link to="/payouts" className="shrink-0 rounded-full bg-destructive px-3 py-1 text-[11px] font-bold text-destructive-foreground">Pay now</Link>}>
          <strong>{fmt(totals.owed)} owed.</strong> Auto-deducted from future payouts.
        </Banner>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {(["financials","orders","archive","history"] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize ${tab === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            {k === "history" ? "Payouts" : k === "archive" ? `Archive${archivedOrders.length ? ` (${archivedOrders.length})` : ""}` : k}
          </button>
        ))}
        <button onClick={downloadCsv} className="ml-auto inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold">
          <Download className="h-3 w-3" /> CSV
        </button>
      </div>

      {/* FINANCIALS — clickable category cards */}
      {tab === "financials" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <CategoryCard k="gross" label="Gross Sales" value={fmt(buckets.gross.value)} count={buckets.gross.orders.length}
              hint="Before fees & refunds" icon={<DollarSign className="h-4 w-4" />} onClick={setDrillCategory} />
            <CategoryCard k="net" label="Net Earnings" value={fmt(totals.net)} count={buckets.net.orders.length}
              hint="After fees & refunds" icon={<TrendingUp className="h-4 w-4" />} accent="primary" onClick={setDrillCategory} />
            <CategoryCard k="available" label="Available Balance" value={fmt(totals.available)}
              hint="Ready to withdraw" icon={<Wallet className="h-4 w-4" />} accent="primary" onClick={setDrillCategory} />
            <CategoryCard k="pending_payout" label="Pending Payouts" value={fmt(totals.processingPayout)}
              hint="In-flight transfers" icon={<ArrowDownToLine className="h-4 w-4" />} onClick={setDrillCategory} />
            <CategoryCard k="reserve" label="Held Reserve" value={fmt(totals.locked)}
              hint="Pending delivery / disputes" icon={<Lock className="h-4 w-4" />} onClick={setDrillCategory} />
            <CategoryCard k="awaiting_payment" label="Awaiting Payment" value={fmt(buckets.awaiting_payment.value)}
              count={buckets.awaiting_payment.orders.length} hint="Buyer hasn't paid yet" icon={<Hourglass className="h-4 w-4" />}
              onClick={setDrillCategory} />
            <CategoryCard k="refunds" label="Refunds" value={fmt(buckets.refunds.value)} count={buckets.refunds.orders.length}
              hint="Total refunded amount" icon={<RotateCcw className="h-4 w-4" />} tone="amber" onClick={setDrillCategory} />
            <CategoryCard k="cancellations" label="Cancellations" value={fmt(buckets.cancellations.value)}
              count={buckets.cancellations.orders.length} hint="Order value cancelled" icon={<XCircle className="h-4 w-4" />}
              tone="destructive" onClick={setDrillCategory} />
            <CategoryCard k="disputes" label="Chargebacks / Disputes" value={fmt(buckets.disputes.value)}
              count={buckets.disputes.orders.length} hint="Under review" icon={<ShieldAlert className="h-4 w-4" />}
              tone="destructive" onClick={setDrillCategory} />
          </div>

          {/* Summary breakdown */}
          <div className="space-y-1.5">
            <Row label="Gross sales" value={fmt(totals.gross)} />
            <Row label="Platform fee" value={`−${fmt(totals.platformFee)}`} negative />
            <Row label="Payment processing" value={`−${fmt(totals.processingFee)}`} negative />
            <Row label="Shipping / labels" value={`−${fmt(totals.shipping)}`} negative />
            <Row label="Promotions" value={`−${fmt(totals.promo)}`} negative />
            <Row label="Refunds" value={`−${fmt(totals.refund)}`} negative />
            <Row label="Negative balance recovery" value={`−${fmt(totals.recovery)}`} negative />
            <Row label="Net earnings" value={fmt(totals.net)} primary />
            <p className="px-1 pt-1 text-[11px] text-muted-foreground">
              Live sales: buyer and seller each cover 50% of Stripe processing (2.9% + $0.30). Marketplace sales: buyer covers it. Orders only move to <strong>Completed</strong> after delivery confirmation, the {COMPLETION_WINDOW_DAYS}-day refund window closes, and no active claims remain.
            </p>
          </div>
        </div>
      )}

      {/* ORDERS — active orders with lifecycle */}
      {tab === "orders" && (
        <div className="space-y-1.5">
          {breakdowns.length === 0 && <p className="text-xs text-muted-foreground">No sales yet.</p>}
          {breakdowns.map(({ order, ...b }) => {
            const isOpen = openOrder === order.id;
            const lc = getLifecycle(order);
            return (
              <div key={order.id} className="rounded-xl bg-card text-xs">
                <button onClick={() => setOpenOrder(isOpen ? null : order.id)} className="flex w-full items-center justify-between gap-2 p-3">
                  <div className="min-w-0 flex-1 text-left">
                    <p className="truncate font-bold">{order.title}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      @{buyerNames[order.buyer_id]?.u ?? "buyer"} · {new Date(order.created_at).toLocaleDateString()}
                    </p>
                    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${LIFECYCLE_COLORS[lc]}`}>{lc}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-primary">{fmt(b.net)}</p>
                    <p className="text-[10px] text-muted-foreground">Net</p>
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

      {/* ARCHIVE */}
      {tab === "archive" && (
        <div className="space-y-1.5">
          <p className="px-1 text-[11px] text-muted-foreground">
            Cancelled, refunded, and awaiting-payment orders. Kept permanently for your records and excluded from Gross / Net totals.
          </p>
          {archivedOrders.length === 0 && <p className="text-xs text-muted-foreground">No archived orders.</p>}
          {archivedOrders.map((o) => {
            const lc = getLifecycle(o);
            const gross = Number(o.amount || 0);
            return (
              <button key={o.id} onClick={() => setOpenOrder(o.id)} className="w-full rounded-xl bg-card p-3 text-left text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{o.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      @{buyerNames[o.buyer_id]?.u ?? "buyer"} · {new Date(o.created_at).toLocaleString()}
                      {o.refunded_at ? ` · refunded ${new Date(o.refunded_at).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${LIFECYCLE_COLORS[lc]}`}>{lc}</span>
                    <p className="mt-1 text-[11px] font-bold">{fmt(gross)}</p>
                  </div>
                </div>
                {Number(o.refunded_amount || 0) > 0 && (
                  <p className="mt-1 text-[11px] text-amber-300">Refunded {fmt(Number(o.refunded_amount))}</p>
                )}
                <p className="mt-1 text-[10px] text-muted-foreground">Tap for full details{isStaff ? " (shipping address visible)" : ""}</p>
              </button>
            );
          })}
        </div>
      )}

      {/* PAYOUTS history */}
      {tab === "history" && (
        <div className="space-y-1.5">
          {payouts.length === 0 && recoveries.length === 0 && (
            <p className="text-xs text-muted-foreground">No payouts or deductions yet.</p>
          )}
          {payouts.map((p) => (
            <div key={p.id} className="rounded-xl bg-card p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold">{fmt(p.amount_cents / 100)}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${
                  p.status === "completed" ? "bg-emerald-500/15 text-emerald-400"
                  : p.status === "failed" || p.status === "canceled" ? "bg-destructive/15 text-destructive"
                  : "bg-amber-500/15 text-amber-300"
                }`}>{p.status}</span>
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Requested {new Date(p.created_at).toLocaleString()}
                {p.completed_at ? ` · completed ${new Date(p.completed_at).toLocaleString()}` : ""}
              </p>
              {p.failure_reason && <p className="mt-1 text-[11px] text-destructive">{p.failure_reason}</p>}
            </div>
          ))}
          {recoveries.length > 0 && (
            <p className="px-1 pt-3 text-[11px] font-bold uppercase text-muted-foreground">Automatic deductions</p>
          )}
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

      {/* Drill-down modal */}
      <CategoryDrillModal
        category={drillCategory}
        onClose={() => setDrillCategory(null)}
        buckets={buckets}
        buyerNames={buyerNames}
        breakdownById={breakdownById}
        isStaff={isStaff}
        onOpenOrder={(id) => { setDrillCategory(null); setOpenOrder(id); }}
      />

      {/* Order detail modal */}
      <OrderDetailModal
        order={[...activeOrders, ...archivedOrders].find((o) => o.id === openOrder) ?? null}
        onClose={() => setOpenOrder(null)}
        buyerNames={buyerNames}
        breakdownById={breakdownById}
        isStaff={isStaff}
      />
    </div>
  );
}

// ============================ Sub-components ============================

type CategoryKey = "gross" | "net" | "available" | "pending_payout" | "reserve"
  | "awaiting_payment" | "refunds" | "cancellations" | "disputes";

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  gross: "Gross Sales", net: "Net Earnings", available: "Available Balance",
  pending_payout: "Pending Payouts", reserve: "Held Reserve",
  awaiting_payment: "Awaiting Payment", refunds: "Refunds",
  cancellations: "Cancellations", disputes: "Chargebacks / Disputes",
};

const CATEGORY_EXPLAINER: Record<CategoryKey, string> = {
  gross: "Total raw order volume before any deductions.",
  net: "What you actually keep after platform commission, processing fees, shipping, refunds and adjustments.",
  available: "Funds you can withdraw right now. Updated after delivery confirmation and trust-tier release.",
  pending_payout: "Funds currently being transferred to your bank. Returns to Available if the transfer fails.",
  reserve: "Funds held back for orders with open disputes, refunds, or unconfirmed delivery. Released as each issue clears.",
  awaiting_payment: "Buyer hasn't completed checkout yet. No money has moved.",
  refunds: "Total amount refunded to buyers across all orders. Shown for record-keeping.",
  cancellations: "Orders that were cancelled before or after payment. Kept here forever for the record.",
  disputes: "Orders currently under chargeback, dispute, or admin review. Funds are reserved until resolved.",
};

function CategoryCard({
  k, label, value, count, hint, icon, accent, tone, onClick,
}: {
  k: CategoryKey; label: string; value: string; count?: number; hint: string;
  icon: React.ReactNode; accent?: "primary"; tone?: "amber" | "destructive";
  onClick: (k: CategoryKey) => void;
}) {
  const valueColor = tone === "destructive" ? "text-destructive"
    : tone === "amber" ? "text-amber-300"
    : accent === "primary" ? "text-primary" : "";
  return (
    <button onClick={() => onClick(k)}
      className="group flex flex-col rounded-xl bg-card p-3 text-left transition hover:bg-card/80">
      <div className="flex items-center gap-1.5 text-[10px] uppercase text-muted-foreground">
        {icon}<span className="truncate">{label}</span>
      </div>
      <p className={`mt-1 text-lg font-bold ${valueColor}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground line-clamp-1">{hint}</p>
      {count != null && count > 0 && (
        <p className="mt-1 text-[10px] font-bold text-primary">{count} order{count === 1 ? "" : "s"} →</p>
      )}
    </button>
  );
}

function Banner({ tone, icon, children, action }: {
  tone: "primary" | "amber" | "destructive"; icon: React.ReactNode;
  children: React.ReactNode; action?: React.ReactNode;
}) {
  const cls = tone === "primary" ? "border-primary/30 bg-primary/10 text-foreground"
    : tone === "amber" ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
    : "border-destructive/40 bg-destructive/10 text-destructive";
  return (
    <div className={`flex items-start gap-2 rounded-xl border p-3 text-xs ${cls}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="flex-1">{children}</div>
      {action}
    </div>
  );
}

function Row({ label, value, negative, primary, small }: {
  label: string; value: string; negative?: boolean; primary?: boolean; small?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between rounded-lg bg-card px-3 ${small ? "py-1.5 text-[11px]" : "py-2.5 text-xs"}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-bold ${primary ? "text-primary" : negative ? "text-destructive" : ""}`}>{value}</span>
    </div>
  );
}

function CategoryDrillModal({
  category, onClose, buckets, buyerNames, breakdownById, isStaff, onOpenOrder,
}: {
  category: CategoryKey | null;
  onClose: () => void;
  buckets: Record<CategoryKey, { orders: Order[]; value: number }>;
  buyerNames: Record<string, { u: string; d: string }>;
  breakdownById: Map<string, ReturnType<typeof computeBreakdown>>;
  isStaff: boolean;
  onOpenOrder: (id: string) => void;
}) {
  if (!category) return null;
  const bucket = buckets[category];
  const balanceOnly = category === "available" || category === "pending_payout" || category === "reserve";
  return (
    <Dialog open={!!category} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{CATEGORY_LABELS[category]}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-xl bg-muted/40 p-3">
            <p className="text-2xl font-bold">{fmt(bucket.value)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{CATEGORY_EXPLAINER[category]}</p>
          </div>
          {balanceOnly ? (
            <p className="text-xs text-muted-foreground">
              This balance reflects platform-wide ledger state. Individual orders contributing to it appear in the <strong>Orders</strong> and <strong>Archive</strong> tabs.
            </p>
          ) : bucket.orders.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nothing here yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {bucket.orders.map((o) => {
                const b = breakdownById.get(o.id);
                const lc = getLifecycle(o);
                const buyer = buyerNames[o.buyer_id];
                return (
                  <li key={o.id}>
                    <button onClick={() => onOpenOrder(o.id)}
                      className="flex w-full items-center justify-between gap-2 rounded-xl bg-card p-3 text-left text-xs hover:bg-card/80">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold">{o.title}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          @{buyer?.u ?? "buyer"}{buyer?.d ? ` · ${buyer.d}` : ""} · #{o.id.slice(0, 8)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(o.created_at).toLocaleString()}
                          {isStaff && o.ship_city ? ` · ${o.ship_city}, ${o.ship_state}` : ""}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${LIFECYCLE_COLORS[lc]}`}>{lc}</span>
                        <p className="mt-1 text-xs font-bold">{fmt(Number(o.amount || 0))}</p>
                        {b && <p className="text-[10px] text-muted-foreground">Net {fmt(b.net)}</p>}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OrderDetailModal({
  order, onClose, buyerNames, breakdownById, isStaff,
}: {
  order: Order | null;
  onClose: () => void;
  buyerNames: Record<string, { u: string; d: string }>;
  breakdownById: Map<string, ReturnType<typeof computeBreakdown>>;
  isStaff: boolean;
}) {
  if (!order) return null;
  const b = breakdownById.get(order.id);
  const lc = getLifecycle(order);
  const buyer = buyerNames[order.buyer_id];
  const archived = isArchivedOrder(order);
  return (
    <Dialog open={!!order} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="truncate">{order.title}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-xs">
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${LIFECYCLE_COLORS[lc]}`}>{lc}</span>
            <span className="text-[10px] text-muted-foreground">Order #{order.id.slice(0, 8)}</span>
          </div>

          <div className="rounded-xl bg-card p-3">
            <p className="text-[10px] uppercase text-muted-foreground">Buyer</p>
            <p className="font-bold">@{buyer?.u ?? "buyer"}</p>
            {buyer?.d && buyer.d !== buyer.u && <p className="text-[11px]">{buyer.d}</p>}
            <p className="text-[11px]">{order.ship_name || "—"}</p>
          </div>

          <div className="rounded-xl bg-card p-3">
            <p className="text-[10px] uppercase text-muted-foreground">Shipping address</p>
            {archived && !isStaff ? (
              <p className="text-[11px] italic text-muted-foreground">
                Hidden — visible to admin only for cancelled/refunded orders.
              </p>
            ) : order.ship_address ? (
              <p className="text-[11px] leading-snug">
                {order.ship_address}<br />
                {[order.ship_city, order.ship_state, order.ship_zip].filter(Boolean).join(", ")}
                {order.ship_country ? ` · ${order.ship_country}` : ""}
              </p>
            ) : (
              <p className="text-[11px] italic text-muted-foreground">No address on file.</p>
            )}
          </div>

          {b && (
            <div className="space-y-1 rounded-xl bg-card p-3">
              <p className="text-[10px] uppercase text-muted-foreground">Financial breakdown</p>
              <Row small label="Gross" value={fmt(b.gross)} />
              <Row small label="Platform fee" value={`−${fmt(b.platformFee)}`} negative />
              <Row small label="Processing" value={`−${fmt(b.processingFee)}`} negative />
              {b.shipping > 0 && <Row small label="Shipping" value={`−${fmt(b.shipping)}`} negative />}
              {b.promo > 0 && <Row small label="Promo" value={`−${fmt(b.promo)}`} negative />}
              {b.refund > 0 && <Row small label="Refund" value={`−${fmt(b.refund)}`} negative />}
              {b.recovery > 0 && <Row small label="Hold recovery" value={`−${fmt(b.recovery)}`} negative />}
              <Row small label="Net to you" value={fmt(b.net)} primary />
            </div>
          )}

          <div className="rounded-xl bg-card p-3">
            <p className="text-[10px] uppercase text-muted-foreground">Timeline</p>
            <ul className="mt-1 space-y-0.5 text-[11px]">
              <li>Ordered: {new Date(order.created_at).toLocaleString()}</li>
              {order.shipped_at && <li>Shipped: {new Date(order.shipped_at).toLocaleString()}</li>}
              {order.delivered_at && <li>Delivered: {new Date(order.delivered_at).toLocaleString()}</li>}
              {order.refunded_at && <li>Refunded: {new Date(order.refunded_at).toLocaleString()}</li>}
            </ul>
          </div>

          <div className="rounded-xl bg-muted/40 p-3 text-[11px] text-muted-foreground">
            <p><strong>Payout eligibility:</strong>{" "}
              {lc === "Completed" ? "Released to Available."
                : lc === "Delivered" ? `Releases after the ${COMPLETION_WINDOW_DAYS}-day refund window closes.`
                : lc === "Chargeback Open" || lc === "Admin Review" ? "Held until review resolves."
                : lc === "Refund Approved" || lc === "Cancelled" ? "Not eligible — order reversed."
                : "Held until delivery is confirmed."}
            </p>
          </div>

          <button onClick={onClose}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-muted px-4 py-2 text-xs font-bold">
            <X className="h-3 w-3" /> Close
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
