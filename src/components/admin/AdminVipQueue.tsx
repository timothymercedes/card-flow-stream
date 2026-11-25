import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { adminDecideVipReview, adminListVipReviews, adminRecordCommissionAdjustment } from "@/lib/vipReview.functions";

const usd = (c: number) => `$${(Number(c) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (s: string) => new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "America/New_York" });
const FILTERS = ["pending_review", "in_progress", "approved", "rejected", "not_qualified", "all"] as const;

export function AdminVipQueue() {
  const list = useServerFn(adminListVipReviews);
  const decide = useServerFn(adminDecideVipReview);
  const adjust = useServerFn(adminRecordCommissionAdjustment);
  const [rows, setRows] = useState<any[] | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("pending_review");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (recalc = false) => {
    setBusy(true);
    try { setRows(await list({ data: { recalc } })); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to load"); }
    finally { setBusy(false); }
  }, [list]);
  useEffect(() => { void load(true); }, [load]);

  const act = async (r: any, action: "approve" | "reject" | "reopen") => {
    const reason = window.prompt(`Documented reason to ${action} VIP for week of ${day(r.week_start)}:`);
    if (!reason || reason.trim().length < 3) return;
    try { await decide({ data: { reviewId: r.id, action, reason } }); toast.success(`Review ${action}d`); void load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };
  const manual = async (r: any) => {
    const type = window.prompt("Adjustment type: manual_credit, manual_debit or dispute_reconsideration", "manual_credit");
    if (!type || !["manual_credit", "manual_debit", "dispute_reconsideration"].includes(type)) return;
    const dollars = Number(window.prompt("Amount in USD (full or partial):") || 0);
    const reason = window.prompt("Documented reason:");
    if (!(dollars > 0) || !reason) return;
    try {
      await adjust({ data: { sellerId: r.seller_id, reviewId: r.id, type: type as any, amountCents: Math.round(dollars * 100), reason } });
      toast.success("Adjustment recorded");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const shown = (rows ?? []).filter((r) => filter === "all" || r.status === filter);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1 text-xs ${filter === f ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{f.replace("_", " ")}</button>
        ))}
        <button disabled={busy} onClick={() => void load(true)} className="ml-auto rounded-lg border border-border px-3 py-1 text-xs">{busy ? "Recalculating…" : "Recalculate"}</button>
      </div>
      {rows === null ? <p className="text-sm text-muted-foreground">Loading…</p> : shown.length === 0 ? (
        <p className="rounded-xl bg-card p-4 text-sm text-muted-foreground">No VIP reviews in this view.</p>
      ) : shown.map((r) => (
        <div key={r.id} className="rounded-xl bg-card p-3 text-xs">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <p className="truncate text-sm font-bold">{r.seller?.shop_name || r.seller?.username || r.seller_id} · week of {day(r.week_start)}</p>
            <span className="rounded-full bg-muted px-2 py-0.5">{r.status.replace("_", " ")}</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
            <p>Paid sales: <b>{usd(r.total_paid_sales_cents)}</b></p>
            <p>Verified delivered: <b>{usd(r.verified_delivered_cents)}</b></p>
            <p>Pending delivery: <b>{usd(r.pending_delivery_cents)}</b></p>
            <p>Excluded (open disputes): <b>{usd(r.disputed_excluded_cents)}</b></p>
            <p>Eligible VIP sales: <b>{usd(r.eligible_vip_sales_cents)}</b></p>
            <p>Transactions: <b>{r.delivered_orders_count}/{r.total_orders_count}</b> delivered</p>
            <p>Delivery performance: <b>{Number(r.delivery_performance_pct).toFixed(1)}%</b></p>
            <p>Dispute history: <b>{r.disputeHistory.total}</b> ({r.disputeHistory.refunded} resolved against)</p>
            <p>Standing: <b>{r.trust?.tier ?? "—"}</b>{r.trust?.frozen ? " · frozen" : ""}{r.trust ? ` · ${Number(r.trust.dispute_rate_30d * 100).toFixed(1)}% disputes 30d` : ""}</p>
            <p>Charged commission: <b>{usd(r.standard_commission_cents)}</b></p>
            <p>VIP credit if approved: <b>{usd(r.potential_vip_rebate_cents)}</b></p>
            <p>Review closes: <b>{day(r.review_deadline)}</b></p>
          </div>
          {r.rejection_reason && <p className="mt-1 text-destructive">Rejected: {r.rejection_reason}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            {r.status === "pending_review" && <button onClick={() => act(r, "approve")} className="rounded-lg bg-primary px-3 py-1 text-primary-foreground">Approve VIP</button>}
            {["pending_review", "in_progress", "not_qualified"].includes(r.status) && <button onClick={() => act(r, "reject")} className="rounded-lg border border-border px-3 py-1">Reject</button>}
            {["rejected", "not_qualified"].includes(r.status) && <button onClick={() => act(r, "reopen")} className="rounded-lg border border-border px-3 py-1">Reconsider</button>}
            <button onClick={() => manual(r)} className="rounded-lg border border-border px-3 py-1">Record adjustment</button>
          </div>
        </div>
      ))}
    </div>
  );
}
