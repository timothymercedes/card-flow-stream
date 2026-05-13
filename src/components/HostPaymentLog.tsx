import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, AlertCircle, CheckCircle2, RefreshCw, XCircle, Clock, Activity, Bell, ShieldCheck } from "lucide-react";
import { FloatingBox, type FloatingBoxRect } from "@/components/FloatingBox";

type Order = {
  id: string;
  stream_id: string | null;
  buyer_id: string;
  seller_id: string;
  title: string;
  amount: number;
  payment_status: string;
  status: string;
  auction_number: number | null;
  created_at: string;
  paid_at: string | null;
  item_image_url: string | null;
};

type Tab = "processing" | "paid" | "failed" | "fixed";

const TAB_META: Record<Tab, { label: string; cls: string }> = {
  processing: { label: "Processing", cls: "text-amber-300" },
  paid:       { label: "Paid",       cls: "text-emerald-300" },
  failed:     { label: "Failed",     cls: "text-rose-400" },
  fixed:      { label: "Fixed",      cls: "text-violet-300" },
};

function classifyOrder(o: Order): Tab | null {
  const s = o.payment_status;
  if (s === "paid") return "paid";
  if (s === "failed" || s === "chargeback") return "failed";
  if (s === "resolved") return "fixed";
  if (s === "awaiting_payment" || s === "processing" || s === "pending") return "processing";
  return null;
}

export function HostPaymentLog({
  streamId, open, onClose,
}: { streamId: string; open: boolean; onClose: () => void }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [usernames, setUsernames] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<Tab>("processing");
  const [busy, setBusy] = useState<string | null>(null);
  const [panelBox, setPanelBox] = useState<FloatingBoxRect>(() => ({
    x: typeof window === "undefined" ? 24 : Math.max(4, window.innerWidth - 412),
    y: 4,
    w: 408,
    h: typeof window === "undefined" ? 640 : Math.max(280, window.innerHeight - 8),
  }));

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("orders")
        .select("id,stream_id,buyer_id,seller_id,title,amount,payment_status,status,auction_number,created_at,paid_at,item_image_url")
        .eq("stream_id", streamId)
        .order("auction_number", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(200);
      if (!cancelled) setOrders((data || []) as any);
      const ids = Array.from(new Set((data || []).map((o: any) => o.buyer_id))).filter(Boolean);
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id,username").in("id", ids);
        if (!cancelled) {
          const map: Record<string, string> = {};
          (profs || []).forEach((p: any) => { map[p.id] = p.username; });
          setUsernames(map);
        }
      }
    }
    load();

    const ch = supabase
      .channel(`payment-orders-${streamId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `stream_id=eq.${streamId}` },
        (p) => {
          const row = (p.new || p.old) as Order;
          if (p.eventType === "DELETE") {
            setOrders((s) => s.filter((o) => o.id !== row.id));
            return;
          }
          setOrders((s) => {
            const next = [...s];
            const idx = next.findIndex((o) => o.id === row.id);
            if (idx === -1) next.unshift(row);
            else next[idx] = { ...next[idx], ...row };
            // Side-effects on state transitions
            if (p.eventType === "UPDATE") {
              const prev = (p.old || {}) as Order;
              if (prev.payment_status !== row.payment_status) {
                if (row.payment_status === "paid") {
                  toast.success(`✓ Paid — @ #${row.auction_number ?? "?"}`, { description: row.title });
                } else if (row.payment_status === "failed" || row.payment_status === "chargeback") {
                  toast.error(`⚠️ Payment failed — #${row.auction_number ?? "?"}`, { description: row.title });
                } else if (row.payment_status === "resolved") {
                  toast.success(`✓ Marked resolved — #${row.auction_number ?? "?"}`);
                }
              }
            }
            next.sort((a, b) => (b.auction_number ?? 0) - (a.auction_number ?? 0)
              || (new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
            return next;
          });
        },
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [streamId]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { processing: 0, paid: 0, failed: 0, fixed: 0 };
    for (const o of orders) {
      const k = classifyOrder(o);
      if (k) c[k]++;
    }
    return c;
  }, [orders]);

  const filtered = useMemo(
    () => orders.filter((o) => classifyOrder(o) === tab),
    [orders, tab],
  );

  async function notifyBuyerRetry(o: Order) {
    setBusy(o.id);
    const { error } = await supabase.from("notifications").insert({
      user_id: o.buyer_id, type: "payment_failed",
      body: `❗ Payment for "${o.title}" failed — please retry payment to keep bidding.`,
      link: "/orders",
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Buyer notified to retry");
  }

  async function blockBidder(o: Order) {
    setBusy(o.id);
    const { error } = await supabase.from("live_bid_blocks").upsert(
      { stream_id: streamId, user_id: o.buyer_id, reason: `Unpaid order #${o.auction_number ?? ""}` },
      { onConflict: "stream_id,user_id" },
    );
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Bidder blocked from this stream");
  }

  async function markResolved(o: Order) {
    setBusy(o.id);
    const { error } = await supabase.from("orders").update({
      payment_status: "resolved",
    }).eq("id", o.id);
    if (!error) {
      // Remove the block, if any
      await supabase.from("live_bid_blocks").delete()
        .eq("stream_id", streamId).eq("user_id", o.buyer_id);
      await supabase.from("notifications").insert({
        user_id: o.buyer_id, type: "payment",
        body: `✓ Payment for "${o.title}" was marked resolved. You can keep bidding.`,
        link: "/orders",
      });
    }
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Marked resolved · bidder unblocked");
  }

  // Auto-block bidders with failed payments and auto-unblock when paid/resolved
  useEffect(() => {
    const failed = orders.filter((o) =>
      ["failed", "chargeback"].includes(o.payment_status));
    failed.forEach((o) => {
      supabase.from("live_bid_blocks").upsert(
        { stream_id: streamId, user_id: o.buyer_id, reason: `Unpaid order #${o.auction_number ?? ""}` },
        { onConflict: "stream_id,user_id" },
      ).then(() => {});
    });
    // Unblock for any paid/resolved buyer who has no remaining failed order in this stream
    const okBuyers = new Set(
      orders.filter((o) => ["paid", "resolved"].includes(o.payment_status)).map((o) => o.buyer_id),
    );
    okBuyers.forEach((buyerId) => {
      const stillFailed = orders.some((o) =>
        o.buyer_id === buyerId && ["failed", "chargeback"].includes(o.payment_status));
      if (!stillFailed) {
        supabase.from("live_bid_blocks").delete()
          .eq("stream_id", streamId).eq("user_id", buyerId).then(() => {});
      }
    });
  }, [orders, streamId]);

  if (!open) return null;

  return (
    <FloatingBox
      box={panelBox}
      onChange={setPanelBox}
      minW={300}
      minH={300}
      resize
      className="z-50 max-w-[calc(100vw-0.5rem)] overflow-hidden bg-card shadow-2xl ring-1 ring-white/10"
    >
      {({ dragHandleProps }) => (
        <div className="flex h-full w-full flex-col">
          <div {...dragHandleProps} className="flex cursor-move items-center justify-between border-b border-white/10 p-3 select-none">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <p className="text-sm font-bold">Payments</p>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{orders.length}</span>
            </div>
            <button onPointerDown={(e) => e.stopPropagation()} onClick={onClose} className="rounded-full p-1.5 hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Tabs */}
          <div onPointerDown={(e) => e.stopPropagation()} className="grid grid-cols-4 gap-1 border-b border-white/10 p-2">
            {(Object.keys(TAB_META) as Tab[]).map((k) => {
              const m = TAB_META[k];
              const active = tab === k;
              return (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`rounded-lg px-1 py-1.5 text-[10px] font-bold leading-tight ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
                >
                  <div>{m.label}</div>
                  <div className={`text-[10px] ${active ? "" : m.cls}`}>{counts[k]}</div>
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <p className="p-6 text-center text-xs text-muted-foreground">
                No {TAB_META[tab].label.toLowerCase()} orders.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {filtered.map((o) => {
                  const isFailed = tab === "failed";
                  const isPaid = o.payment_status === "paid";
                  return (
                    <li
                      key={o.id}
                      className={`rounded-lg p-2.5 ${isFailed ? "bg-rose-500/10 ring-1 ring-rose-500/30" : isPaid ? "bg-emerald-500/10 ring-1 ring-emerald-500/30" : "bg-muted/40"}`}
                    >
                      <div className="flex items-start gap-2">
                        {o.item_image_url && (
                          <img src={o.item_image_url} alt="" className="h-10 w-10 rounded object-cover" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-bold">
                              <span className="rounded bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground">#{o.auction_number ?? "?"}</span>
                              <span className={`ml-1.5 ${TAB_META[tab].cls}`}>{TAB_META[classifyOrder(o) || tab].label}</span>
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {new Date(o.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                          <p className="truncate text-[11px]">
                            <span className="text-muted-foreground">won by</span>{" "}
                            <span className="font-semibold">@{usernames[o.buyer_id] || "buyer"}</span>
                            <span className="ml-1.5 font-bold tabular-nums text-primary">${Number(o.amount).toFixed(2)}</span>
                          </p>
                          <p className="truncate text-[10px] text-muted-foreground">{o.title}</p>
                          
                          {isPaid && (
                            <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">
                              <CheckCircle2 className="h-3 w-3" /> Item marked sold · queued for shipping
                            </p>
                          )}
                          {isFailed && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              <button
                                disabled={busy === o.id}
                                onClick={() => notifyBuyerRetry(o)}
                                className="inline-flex items-center gap-1 rounded-md bg-amber-500/20 px-2 py-1 text-[10px] font-bold text-amber-200 disabled:opacity-50"
                              >
                                <Bell className="h-3 w-3" /> Notify retry
                              </button>
                              <button
                                disabled={busy === o.id}
                                onClick={() => blockBidder(o)}
                                className="inline-flex items-center gap-1 rounded-md bg-rose-500/20 px-2 py-1 text-[10px] font-bold text-rose-200 disabled:opacity-50"
                              >
                                <XCircle className="h-3 w-3" /> Block bidder
                              </button>
                              <button
                                disabled={busy === o.id}
                                onClick={() => markResolved(o)}
                                className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[10px] font-bold text-primary-foreground disabled:opacity-50"
                              >
                                <ShieldCheck className="h-3 w-3" /> Mark fixed
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-white/10 p-2 text-center text-[10px] text-muted-foreground">
            Live updates · failed payments highlighted in red · paid orders flow into Seller Hub shipping.
          </div>
        </div>
      )}
    </FloatingBox>
  );
}

/** Helper: log a payment event from anywhere on the live page. */
export async function logPaymentEvent(input: {
  streamId: string;
  buyerId?: string | null;
  buyerUsername?: string | null;
  orderId?: string | null;
  eventType: "payment_pending" | "payment_paid" | "payment_declined" | "payment_recovered" | "payment_refunded" | "payment_failed" | "payment_retry";
  amount?: number | null;
  itemLabel?: string | null;
  message?: string | null;
}) {
  const payload: any = {
    stream_id: input.streamId,
    buyer_id: input.buyerId ?? null,
    buyer_username: input.buyerUsername ?? null,
    order_id: input.orderId ?? null,
    event_type: input.eventType,
    amount: input.amount ?? null,
    item_label: input.itemLabel ?? null,
    message: input.message ?? null,
  };
  const { error } = await (supabase.from("stream_payment_events") as any).insert(payload);
  if (error) console.error("logPaymentEvent failed:", error);
}
