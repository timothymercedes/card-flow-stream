import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { X, ShieldAlert, Send } from "lucide-react";
import { cancelOrderAction } from "@/lib/order-actions.functions";

type Msg = { user_id: string; username: string; role: "buyer" | "seller" | "admin"; body: string; at: string };

interface Props {
  order: any;
  role: "buyer" | "seller";
  onClose: () => void;
  onChanged?: () => void;
}

export function OrderCancellation({ order, role, onClose, onChanged }: Props) {
  const { user, profile } = useAuth();
  const cancelOrderServer = useServerFn(cancelOrderAction);
  const [cancellation, setCancellation] = useState<any | null>(null);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await supabase
      .from("order_cancellations")
      .select("*")
      .eq("order_id", order.id)
      .in("status", ["pending", "escalated"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setCancellation(data);
  }
  useEffect(() => {
    setCancellation(null);
    setReason("");
    setMsg("");
    load();
  }, [order.id]);

  async function createRequest() {
    if (!user || !reason.trim()) return toast.error("Add a reason");
    setBusy(true);
    const { error } = await supabase.from("order_cancellations").insert({
      order_id: order.id,
      requested_by: user.id,
      requested_by_role: role,
      reason: reason.trim(),
      messages: [{
        user_id: user.id,
        username: profile?.username || "user",
        role,
        body: reason.trim(),
        at: new Date().toISOString(),
      }],
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    const otherId = role === "buyer" ? order.seller_id : order.buyer_id;
    await supabase.from("notifications").insert({
      user_id: otherId,
      sender_id: user.id,
      type: "order",
      body: `${profile?.username || "User"} requested cancellation on "${order.title}"`,
      link: role === "buyer" ? "/store" : "/orders",
    });
    toast.success("Cancellation request sent");
    setReason("");
    onChanged?.();
    load();
  }

  async function postMessage() {
    if (!cancellation || !msg.trim() || !user) return;
    const next: Msg[] = [
      ...(cancellation.messages || []),
      {
        user_id: user.id,
        username: profile?.username || "user",
        role,
        body: msg.trim(),
        at: new Date().toISOString(),
      },
    ];
    setBusy(true);
    const { error } = await supabase
      .from("order_cancellations")
      .update({ messages: next })
      .eq("id", cancellation.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    setMsg("");
    load();
  }

  async function setStatus(status: "accepted" | "declined" | "cancelled") {
    if (!cancellation) return;
    setBusy(true);
    if (status === "accepted") {
      try {
        await cancelOrderServer({ data: { orderId: order.id, reason: cancellation.reason || "Cancellation accepted" } });
      } catch (e: any) {
        setBusy(false);
        return toast.error(e?.message ?? "Unable to cancel order");
      }
    }
    const patch: any = { status };
    if (status === "accepted" || status === "cancelled") {
      patch.resolved_at = new Date().toISOString();
    }
    const { error } = await supabase.from("order_cancellations").update(patch).eq("id", cancellation.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Request ${status}`);
    onChanged?.();
    if (status === "accepted" || status === "declined" || status === "cancelled") {
      onClose();
    } else {
      load();
    }
  }

  async function escalate() {
    if (!cancellation) return;
    setBusy(true);
    const { error } = await supabase
      .from("order_cancellations")
      .update({ admin_requested: true, status: "escalated" })
      .eq("id", cancellation.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Escalated to admin");
    load();
  }

  const status = cancellation?.status;
  const canDecide = role === "seller" && status === "pending";
  const canCloseOwn = cancellation && cancellation.requested_by === user?.id && status === "pending";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-3">
      <div className="w-full max-w-md rounded-2xl bg-card p-4 shadow-xl">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-bold">{order.payment_status === "paid" && role === "buyer" ? "Cancel & Refund" : "Cancel Order"}</h2>
          <button onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <p className="text-xs text-muted-foreground truncate">"{order.title}" · ${Number(order.amount).toFixed(2)}</p>
        {order.payment_status === "paid" && role === "buyer" && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            The seller will be notified. If they accept (or admin steps in), you'll be refunded to your original payment method in 5–10 business days.
          </p>
        )}

        {!cancellation && (
          <div className="mt-3 space-y-2">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={role === "seller" ? "Reason for cancelling (shown to buyer)" : "Why are you requesting cancellation?"}
              className="w-full rounded-lg bg-input px-3 py-2 text-sm outline-none min-h-20"
            />
            {role === "seller" ? (
              <>
                <button
                  onClick={async () => {
                    if (!user || !reason.trim()) return toast.error("Add a reason");
                    if (!window.confirm("Cancel this order now? The buyer will be notified and any payment should be refunded.")) return;
                    setBusy(true);
                    const paid = (order.payment_status || "") === "paid";
                    try {
                      await cancelOrderServer({ data: { orderId: order.id, reason: reason.trim() } });
                    } catch (e: any) {
                      setBusy(false);
                      return toast.error(e?.message ?? "Unable to cancel order");
                    }
                    await supabase.from("order_cancellations").insert({
                      order_id: order.id,
                      requested_by: user.id,
                      requested_by_role: "seller",
                      reason: reason.trim(),
                      status: "cancelled",
                      resolved_at: new Date().toISOString(),
                      messages: [{ user_id: user.id, username: profile?.username || "seller", role: "seller", body: reason.trim(), at: new Date().toISOString() }],
                    });
                    setBusy(false);
                    toast.success("Order cancelled");
                    onChanged?.();
                    onClose();
                  }}
                  disabled={busy || !reason.trim()}
                  className="w-full rounded-lg bg-destructive py-2 text-sm font-bold text-destructive-foreground disabled:opacity-60"
                >
                  Cancel order now
                </button>
                <button
                  onClick={createRequest}
                  disabled={busy || !reason.trim()}
                  className="w-full rounded-lg bg-muted py-2 text-xs font-semibold disabled:opacity-60"
                >
                  Or send cancellation request to buyer
                </button>
              </>
            ) : (
              <button
                onClick={createRequest}
                disabled={busy || !reason.trim()}
                className="w-full rounded-lg bg-primary py-2 text-sm font-bold text-primary-foreground disabled:opacity-60"
              >
                Send cancel request
              </button>
            )}
          </div>
        )}

        {cancellation && (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="rounded-full bg-muted px-2 py-0.5 font-semibold capitalize">{status}</span>
              {cancellation.admin_requested && (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-400">
                  Admin requested
                </span>
              )}
            </div>
            <div className="mt-3 max-h-60 space-y-2 overflow-y-auto rounded-lg bg-muted/30 p-2">
              {(cancellation.messages || []).map((m: Msg, i: number) => (
                <div key={i} className={`rounded-lg px-2 py-1.5 text-xs ${m.role === role ? "bg-primary/15 ml-6" : "bg-card mr-6"}`}>
                  <p className="text-[10px] font-semibold text-muted-foreground capitalize">{m.username} · {m.role}</p>
                  <p>{m.body}</p>
                </div>
              ))}
            </div>
            {status !== "accepted" && status !== "cancelled" && status !== "declined" && (
              <div className="mt-2 flex gap-2">
                <input
                  value={msg}
                  onChange={(e) => setMsg(e.target.value)}
                  placeholder="Reply…"
                  className="flex-1 rounded-lg bg-input px-3 py-2 text-sm outline-none"
                />
                <button onClick={postMessage} disabled={busy || !msg.trim()} className="rounded-lg bg-primary px-3 text-primary-foreground disabled:opacity-50">
                  <Send className="h-4 w-4" />
                </button>
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {canDecide && (
                <>
                  <button onClick={() => setStatus("accepted")} disabled={busy} className="flex-1 rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground">
                    Accept &amp; cancel order
                  </button>
                  <button onClick={() => setStatus("declined")} disabled={busy} className="flex-1 rounded-lg bg-muted py-2 text-xs font-bold">
                    Decline
                  </button>
                </>
              )}
              {canCloseOwn && (
                <button onClick={() => setStatus("cancelled")} disabled={busy} className="flex-1 rounded-lg bg-muted py-2 text-xs font-bold">
                  Withdraw request
                </button>
              )}
              {!cancellation.admin_requested && status !== "accepted" && status !== "cancelled" && (
                <button onClick={escalate} disabled={busy} className="flex items-center justify-center gap-1 rounded-lg bg-amber-500/15 px-3 py-2 text-xs font-bold text-amber-400">
                  <ShieldAlert className="h-3.5 w-3.5" /> Escalate to admin
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
