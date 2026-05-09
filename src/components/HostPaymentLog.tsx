import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, AlertCircle, CheckCircle2, RefreshCw, XCircle, Clock, Activity } from "lucide-react";
import { FloatingBox, type FloatingBoxRect } from "@/components/FloatingBox";

type Event = {
  id: string;
  stream_id: string;
  buyer_id: string | null;
  buyer_username: string | null;
  order_id: string | null;
  event_type: string;
  amount: number | null;
  item_label: string | null;
  message: string | null;
  created_at: string;
};

const TYPE_META: Record<string, { label: string; color: string; icon: any }> = {
  payment_pending:   { label: "Pending",   color: "text-amber-300",   icon: Clock },
  payment_paid:      { label: "Paid",      color: "text-emerald-300", icon: CheckCircle2 },
  payment_declined:  { label: "Declined",  color: "text-rose-400",    icon: XCircle },
  payment_recovered: { label: "Recovered", color: "text-emerald-300", icon: RefreshCw },
  payment_refunded:  { label: "Refunded",  color: "text-violet-300",  icon: RefreshCw },
  payment_failed:    { label: "Failed",    color: "text-rose-400",    icon: AlertCircle },
  payment_retry:     { label: "Retrying",  color: "text-amber-300",   icon: RefreshCw },
};

export function HostPaymentLog({
  streamId, open, onClose,
}: { streamId: string; open: boolean; onClose: () => void }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [unread, setUnread] = useState(0);
  const [panelBox, setPanelBox] = useState<FloatingBoxRect>(() => ({
    x: typeof window === "undefined" ? 24 : Math.max(4, window.innerWidth - 392),
    y: 4,
    w: 388,
    h: typeof window === "undefined" ? 620 : Math.max(260, window.innerHeight - 8),
  }));

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("stream_payment_events")
        .select("*").eq("stream_id", streamId)
        .order("created_at", { ascending: false }).limit(100);
      if (!cancelled) setEvents((data || []) as any);
    }
    load();

    const ch = supabase
      .channel(`payment-events-${streamId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "stream_payment_events", filter: `stream_id=eq.${streamId}` },
        (p) => {
          const row = p.new as any;
          setEvents((s) => [row, ...s]);
          if (!open) setUnread((u) => u + 1);
          // Toast alert for important events
          const meta = TYPE_META[row.event_type];
          if (row.event_type === "payment_declined" || row.event_type === "payment_failed") {
            toast.error(`⚠️ ${meta?.label || row.event_type} — @${row.buyer_username || "buyer"}`, {
              description: row.item_label || row.message || undefined,
            });
          } else if (row.event_type === "payment_recovered" || row.event_type === "payment_paid") {
            toast.success(`✓ ${meta?.label || row.event_type} — @${row.buyer_username || "buyer"}`, {
              description: row.item_label || row.message || undefined,
            });
          }
        },
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [streamId, open]);

  useEffect(() => { if (open) setUnread(0); }, [open]);

  if (!open) {
    // Render a small floating button when there are unread events (host opens it via parent button normally)
    return null;
  }

  return (
    <FloatingBox
      box={panelBox}
      onChange={setPanelBox}
      minW={280}
      minH={260}
      resize
      className="z-50 max-w-[calc(100vw-0.5rem)] overflow-hidden bg-card shadow-2xl ring-1 ring-white/10"
    >
      {({ dragHandleProps }) => (
        <div className="flex h-full w-full flex-col">
      <div {...dragHandleProps} className="flex cursor-move items-center justify-between border-b border-white/10 p-3 select-none">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <p className="text-sm font-bold text-foreground">Payment Activity</p>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{events.length}</span>
        </div>
        <button onPointerDown={(e) => e.stopPropagation()} onClick={onClose} className="rounded-full p-1.5 hover:bg-muted">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {events.length === 0 ? (
          <p className="p-6 text-center text-xs text-muted-foreground">
            No payment events yet. You'll see paid, declined, and recovered payments here in real time.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {events.map((e) => {
              const meta = TYPE_META[e.event_type] || { label: e.event_type, color: "text-foreground", icon: Activity };
              const Icon = meta.icon;
              return (
                <li key={e.id} className="rounded-lg bg-muted/40 p-2.5">
                  <div className="flex items-start gap-2">
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${meta.color}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-xs font-bold ${meta.color}`}>{meta.label}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(e.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <p className="truncate text-[11px] text-foreground">
                        @{e.buyer_username || "buyer"}
                        {e.amount != null && <span className="ml-1.5 font-bold tabular-nums">${Number(e.amount).toFixed(2)}</span>}
                      </p>
                      {(e.item_label || e.message) && (
                        <p className="truncate text-[10px] text-muted-foreground">
                          {e.item_label || e.message}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
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
  // seller_id is auto-filled by DB trigger; cast bypasses strict insert types.
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
