import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMyWeeklyCommission } from "@/lib/vipReview.functions";
import { COMMISSION_TIER_CENTS, VIP_THRESHOLD_CENTS, weeklyStandardCommissionCents } from "@/lib/feePolicy";

const usd = (c: number) => `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (s: string) => new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "America/New_York" });
const STATUS: Record<string, string> = {
  in_progress: "Verifying deliveries", pending_review: "VIP review pending", not_qualified: "Did not qualify",
  approved: "VIP approved", rejected: "VIP not approved",
};

export function SellerCommissionCard() {
  const load = useServerFn(getMyWeeklyCommission);
  const [data, setData] = useState<Awaited<ReturnType<typeof getMyWeeklyCommission>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { load().then(setData).catch((e) => setError(e instanceof Error ? e.message : "Unavailable")); }, [load]);

  if (error) return <div className="mb-4 rounded-xl bg-card p-3 text-xs text-muted-foreground">Weekly commission is unavailable right now.</div>;
  if (!data) return <div className="mb-4 h-28 animate-pulse rounded-xl bg-card" />;

  const paid = data.paidThisWeekCents;
  const tierPct = Math.min(100, (paid / COMMISSION_TIER_CENTS) * 100);
  const current = (data.reviews as any[]).find((r) => r.week_start === data.weekStart) ?? (data.reviews as any[])[0];
  const others = (data.reviews as any[]).filter((r) => r !== current && r.total_paid_sales_cents > 0);
  const eligible = Number(current?.eligible_vip_sales_cents ?? 0);
  const vipPct = Math.min(100, (eligible / VIP_THRESHOLD_CENTS) * 100);

  return (
    <section className="mb-4 rounded-xl bg-card p-3" aria-label="Weekly commission and VIP">
      <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <h2 className="truncate text-sm font-bold">Weekly commission & VIP</h2>
        <span className="text-[10px] text-muted-foreground">Week of {day(data.weekStart)} · Mon–Sun ET</span>
      </div>
      <p className="text-xs text-muted-foreground">Paid Marketplace + Live sales this week: <b className="text-foreground">{usd(paid)}</b> · commission so far {usd(weeklyStandardCommissionCents(paid))}</p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${tierPct}%` }} /></div>
      <p className="mt-1 text-[11px] text-muted-foreground">5% on the first $500 · 8% above $500{paid >= COMMISSION_TIER_CENTS ? " — you're in the 8% tier" : ` — ${usd(COMMISSION_TIER_CENTS - paid)} left at 5%`}</p>

      <div className="mt-3 rounded-lg border border-border p-2">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <p className="truncate text-xs font-semibold">VIP progress (verified deliveries)</p>
          {current && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{STATUS[current.status] ?? current.status}</span>}
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-amber-500" style={{ width: `${vipPct}%` }} /></div>
        <p className="mt-1 text-[11px] text-muted-foreground">{usd(eligible)} of {usd(VIP_THRESHOLD_CENTS)} delivered & verified</p>
        {current && (
          <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[10px]">
            <div><p className="font-bold">{usd(current.verified_delivered_cents)}</p><p className="text-muted-foreground">Delivered</p></div>
            <div><p className="font-bold">{usd(current.pending_delivery_cents)}</p><p className="text-muted-foreground">In transit</p></div>
            <div><p className="font-bold">{usd(current.disputed_excluded_cents)}</p><p className="text-muted-foreground">On hold (dispute)</p></div>
          </div>
        )}
        {current && <p className="mt-2 text-[10px] text-muted-foreground">Deliveries verified by {day(current.review_deadline)} count toward this week. Shipping and tax don't count.</p>}
      </div>

      {others.length > 0 && (
        <ul className="mt-2 space-y-1">
          {others.map((r) => (
            <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 text-[11px]">
              <span className="truncate">Week of {day(r.week_start)} · {usd(r.eligible_vip_sales_cents)} eligible</span>
              <span className="text-muted-foreground">{STATUS[r.status] ?? r.status}</span>
            </li>
          ))}
        </ul>
      )}
      {data.adjustments.length > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground">Latest adjustment: {usd(Number(data.adjustments[0].amount_cents))} — {data.adjustments[0].reason}</p>
      )}
    </section>
  );
}
