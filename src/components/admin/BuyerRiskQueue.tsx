import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShieldAlert, X, Snowflake, Ban, BadgeCheck, AlertTriangle } from "lucide-react";
import {
  getBuyerRiskQueueFn,
  getBuyerRiskDetailFn,
  applyBuyerRestrictionFn,
  clearBuyerRestrictionFn,
  clearBuyerReviewFn,
} from "@/lib/buyer-risk.functions";

type QueueRow = {
  id: string;
  buyer_id: string;
  reason: string;
  unpaid_strikes: number;
  status: string;
  created_at: string;
  profile: { username?: string; avatar_url?: string | null; created_at?: string } | null;
};

const KIND_OPTIONS = [
  { value: "purchase_block", label: "Block purchases", icon: Ban },
  { value: "bid_limit", label: "Limit bidding", icon: ShieldAlert },
  { value: "require_verification", label: "Require KYC", icon: BadgeCheck },
  { value: "frozen", label: "Freeze account", icon: Snowflake },
] as const;

export function BuyerRiskQueue() {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const getQueue = useServerFn(getBuyerRiskQueueFn);

  async function refresh() {
    setLoading(true);
    try {
      const { rows } = await getQueue({ data: undefined as any });
      setRows(rows as QueueRow[]);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load review queue");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold">Buyers under review</h2>
        <button onClick={refresh} className="text-xs text-primary underline">Refresh</button>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-xs text-muted-foreground">
          No buyers currently flagged for review. The system auto-flags buyers whose 30-day risk score crosses thresholds.
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {rows.map((r) => (
            <li key={r.id} className="p-3 text-xs">
              <button
                className="flex w-full items-start gap-3 text-left"
                onClick={() => setOpenId(r.buyer_id)}
              >
                {r.profile?.avatar_url ? (
                  <img src={r.profile.avatar_url} className="h-9 w-9 rounded-full object-cover" alt="" />
                ) : (
                  <div className="grid h-9 w-9 place-content-center rounded-full bg-muted text-[10px] font-bold">
                    {r.profile?.username?.[0]?.toUpperCase() ?? "?"}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold">@{r.profile?.username ?? r.buyer_id.slice(0, 8)}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 font-bold text-destructive">
                      <AlertTriangle className="h-3 w-3" /> score {r.unpaid_strikes}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-muted-foreground">{r.reason}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground/70">
                    Queued {new Date(r.created_at).toLocaleString()}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {openId && (
        <BuyerRiskDetail
          buyerId={openId}
          reviewId={rows.find((r) => r.buyer_id === openId)?.id}
          onClose={() => setOpenId(null)}
          onResolved={() => { setOpenId(null); refresh(); }}
        />
      )}
    </div>
  );
}

function BuyerRiskDetail({
  buyerId, reviewId, onClose, onResolved,
}: { buyerId: string; reviewId?: string; onClose: () => void; onResolved: () => void }) {
  const getDetail = useServerFn(getBuyerRiskDetailFn);
  const applyR = useServerFn(applyBuyerRestrictionFn);
  const clearR = useServerFn(clearBuyerRestrictionFn);
  const clearReview = useServerFn(clearBuyerReviewFn);

  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<typeof KIND_OPTIONS[number]["value"]>("purchase_block");
  const [reason, setReason] = useState("");
  const [limitDollars, setLimitDollars] = useState("100");

  async function load() {
    const res = await getDetail({ data: { userId: buyerId } });
    setD(res);
  }
  useEffect(() => { load(); }, [buyerId]);

  async function apply() {
    if (!reason.trim()) { toast.error("Reason required"); return; }
    setBusy(true);
    try {
      await applyR({
        data: {
          userId: buyerId,
          kind,
          reason: reason.trim(),
          centsLimit: kind === "bid_limit" ? Math.round(Number(limitDollars) * 100) : null,
          expiresAt: null,
        },
      });
      toast.success("Restriction applied");
      setReason("");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally { setBusy(false); }
  }

  async function clearOne(id: string) {
    setBusy(true);
    try { await clearR({ data: { restrictionId: id } }); await load(); toast.success("Cleared"); }
    catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setBusy(false); }
  }

  async function resolve(resolution: "waived" | "restored" | "banned") {
    if (!reviewId) return onResolved();
    setBusy(true);
    try {
      await clearReview({ data: { reviewId, resolution } });
      toast.success("Review resolved");
      onResolved();
    } catch (e: any) { toast.error(e?.message || "Failed"); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/70 sm:items-center" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-2xl bg-card sm:rounded-2xl border border-border" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-bold">Buyer risk review</h3>
          <button onClick={onClose}><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {!d ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : (
            <>
              <section>
                <div className="flex items-center gap-3">
                  {d.profile?.avatar_url ? (
                    <img src={d.profile.avatar_url} className="h-12 w-12 rounded-full object-cover" alt="" />
                  ) : (
                    <div className="grid h-12 w-12 place-content-center rounded-full bg-muted text-sm font-bold">
                      {d.profile?.username?.[0]?.toUpperCase() ?? "?"}
                    </div>
                  )}
                  <div>
                    <div className="font-bold">@{d.profile?.username ?? buyerId.slice(0, 8)}</div>
                    <div className="text-muted-foreground">
                      {d.profile?.address_country ?? "—"} · joined {d.profile?.created_at ? new Date(d.profile.created_at).toLocaleDateString() : "—"}
                    </div>
                    <div className="text-muted-foreground">30-day score: <strong className="text-destructive">{d.score}</strong> · {d.affectedSellers.length} sellers affected</div>
                  </div>
                </div>
              </section>

              <section>
                <h4 className="mb-1.5 font-bold uppercase text-[10px] text-muted-foreground">Signal breakdown (30d)</h4>
                {Object.keys(d.breakdown).length === 0 ? (
                  <p className="text-muted-foreground">No signals.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    {Object.entries(d.breakdown).map(([k, v]) => (
                      <div key={k} className="rounded-lg border border-border bg-muted/30 p-2">
                        <div className="font-bold">{v as number}</div>
                        <div className="text-[10px] text-muted-foreground">{k.replace(/_/g, " ")}</div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <h4 className="mb-1.5 font-bold uppercase text-[10px] text-muted-foreground">Recent orders</h4>
                {d.recentOrders.length === 0 ? (
                  <p className="text-muted-foreground">None.</p>
                ) : (
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {d.recentOrders.slice(0, 8).map((o: any) => (
                      <li key={o.id} className="flex items-center justify-between gap-2 p-2">
                        <span className="truncate">{o.title}</span>
                        <span className="shrink-0 text-muted-foreground">${Number(o.amount).toFixed(2)} · {o.payment_status}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h4 className="mb-1.5 font-bold uppercase text-[10px] text-muted-foreground">Active restrictions</h4>
                {d.restrictions.filter((r: any) => r.active).length === 0 ? (
                  <p className="text-muted-foreground">None.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {d.restrictions.filter((r: any) => r.active).map((r: any) => (
                      <li key={r.id} className="flex items-start justify-between gap-2 rounded-lg border border-border p-2">
                        <div className="min-w-0">
                          <div className="font-bold">{r.kind}{r.cents_limit ? ` · $${(r.cents_limit / 100).toFixed(2)}` : ""}</div>
                          <div className="text-muted-foreground">{r.reason}</div>
                        </div>
                        <button disabled={busy} onClick={() => clearOne(r.id)} className="rounded-full border border-border px-2 py-0.5 text-[10px]">
                          Clear
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
                <h4 className="font-bold">Apply restriction</h4>
                <div className="grid grid-cols-2 gap-2">
                  {KIND_OPTIONS.map((o) => {
                    const Icon = o.icon;
                    const active = kind === o.value;
                    return (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => setKind(o.value)}
                        className={`flex items-center gap-1.5 rounded-lg border p-2 text-[11px] ${active ? "border-primary bg-primary/10" : "border-border"}`}
                      >
                        <Icon className="h-3.5 w-3.5" /> {o.label}
                      </button>
                    );
                  })}
                </div>
                {kind === "bid_limit" && (
                  <label className="block">
                    <span className="text-[10px] text-muted-foreground">Max purchase/bid ($)</span>
                    <input
                      type="number" min={0} step="1" value={limitDollars}
                      onChange={(e) => setLimitDollars(e.target.value)}
                      className="mt-0.5 w-full rounded-lg border border-border bg-background p-1.5 text-xs"
                    />
                  </label>
                )}
                <textarea
                  rows={2}
                  placeholder="Reason (shown to buyer)…"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background p-2 text-xs"
                />
                <button
                  disabled={busy}
                  onClick={apply}
                  className="w-full rounded-lg bg-destructive py-2 text-xs font-bold text-destructive-foreground disabled:opacity-50"
                >
                  Apply restriction
                </button>
              </section>
            </>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 border-t border-border p-3 text-[11px]">
          <button disabled={busy} onClick={() => resolve("waived")} className="rounded-lg border border-border py-2 font-semibold">
            Waive
          </button>
          <button disabled={busy} onClick={() => resolve("restored")} className="rounded-lg bg-emerald-600 py-2 font-bold text-white">
            Clear & restore
          </button>
          <button disabled={busy} onClick={() => resolve("banned")} className="rounded-lg bg-destructive py-2 font-bold text-destructive-foreground">
            Mark banned
          </button>
        </div>
      </div>
    </div>
  );
}
