/**
 * BuyerOrderPopover — host-side detail popup for a single order.
 *
 * Subscribes to postgres_changes on `orders` so the payment status flips
 * in real time when the buyer fixes their card via FixPaymentModal in the
 * livestream. Used by the LiveSellerDashboard's Buyers / Pending /
 * Winners lists.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { X, CreditCard, Package, User, DollarSign, Truck } from "lucide-react";

type OrderRow = {
  id: string;
  title: string;
  amount: number;
  shipping_amount: number;
  buyer_id: string;
  payment_status: string;
  prep_status: string | null;
  ship_country: string | null;
  created_at: string;
  paid_at: string | null;
  payment_failure_count: number | null;
  tracking_number: string | null;
};

const PAY_BADGE: Record<string, { label: string; cls: string }> = {
  paid:             { label: "✅ Paid",            cls: "bg-emerald-500/20 text-emerald-200 ring-emerald-500/40" },
  awaiting_payment: { label: "⏳ Awaiting",        cls: "bg-amber-500/20 text-amber-200 ring-amber-500/40" },
  processing:       { label: "🟡 Processing",      cls: "bg-amber-500/20 text-amber-200 ring-amber-500/40" },
  failed:           { label: "🔴 Payment failed",  cls: "bg-rose-500/20 text-rose-200 ring-rose-500/40" },
  refunded:         { label: "↩︎ Refunded",        cls: "bg-zinc-500/20 text-zinc-200 ring-zinc-500/40" },
  cancelled:        { label: "✖ Cancelled",        cls: "bg-zinc-500/20 text-zinc-200 ring-zinc-500/40" },
};

export function BuyerOrderPopover({
  orderId,
  onClose,
}: {
  orderId: string;
  onClose: () => void;
}) {
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [username, setUsername] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("orders")
        .select("id,title,amount,shipping_amount,buyer_id,payment_status,prep_status,ship_country,created_at,paid_at,payment_failure_count,tracking_number")
        .eq("id", orderId)
        .maybeSingle();
      if (cancelled || !data) return;
      setOrder(data as any);
      const { data: prof } = await supabase
        .from("profiles")
        .select("username")
        .eq("user_id", (data as any).buyer_id)
        .maybeSingle();
      if (!cancelled) setUsername((prof as any)?.username ?? "buyer");
    }
    load();
    const ch = supabase
      .channel(`order-detail-${orderId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${orderId}` },
        (p: any) => setOrder((cur) => ({ ...(cur as any), ...p.new })),
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [orderId]);

  const badge = order ? (PAY_BADGE[order.payment_status] ?? { label: order.payment_status, cls: "bg-zinc-500/20 text-zinc-200 ring-zinc-500/40" }) : null;

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-card p-4 shadow-2xl ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Order detail</p>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-muted" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {!order ? (
          <p className="py-8 text-center text-xs text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="mb-3 space-y-1">
              <p className="flex items-center gap-1.5 text-xs"><User className="h-3 w-3 text-muted-foreground" /> <span className="font-bold">@{username}</span></p>
              <p className="flex items-start gap-1.5 text-sm font-extrabold"><Package className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" /> <span className="truncate">{order.title}</span></p>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              {badge && (
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-extrabold ring-1 ${badge.cls}`}>
                  <CreditCard className="h-3 w-3" />
                  {badge.label}
                </span>
              )}
              {(order.payment_failure_count ?? 0) > 0 && order.payment_status !== "paid" && (
                <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-200 ring-1 ring-rose-500/30">
                  {order.payment_failure_count}× attempts
                </span>
              )}
              {order.prep_status && order.prep_status !== "label_pending" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold text-sky-200 ring-1 ring-sky-500/30">
                  <Truck className="h-3 w-3" />
                  {order.prep_status.replace(/_/g, " ")}
                </span>
              )}
            </div>

            <div className="space-y-1 rounded-lg bg-muted/40 p-2 text-[11px] tabular-nums">
              <div className="flex justify-between"><span className="text-muted-foreground">Item</span><span>${Number(order.amount - (order.shipping_amount || 0)).toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Shipping</span><span>${Number(order.shipping_amount || 0).toFixed(2)}</span></div>
              <div className="mt-1 flex justify-between border-t border-white/5 pt-1 font-extrabold"><span>Total</span><span className="text-emerald-300">${Number(order.amount).toFixed(2)}</span></div>
              <div className="flex justify-between pt-1 text-[10px] text-muted-foreground"><span>Ships to</span><span>{order.ship_country || "—"}</span></div>
            </div>

            {order.payment_status === "failed" && (
              <p className="mt-3 rounded-lg bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-200 ring-1 ring-amber-500/30">
                <DollarSign className="mr-0.5 inline h-3 w-3" />
                Buyer was notified to fix their payment in-stream. This card will flip to ✅ Paid automatically once they retry.
              </p>
            )}
            {order.payment_status === "paid" && order.paid_at && (
              <p className="mt-3 text-[10px] text-muted-foreground">Paid {new Date(order.paid_at).toLocaleTimeString()}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
