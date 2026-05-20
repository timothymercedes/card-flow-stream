/**
 * FixPaymentModal — shown inside the live stream when an auto-charge for a
 * won auction fails. Lets the buyer retry with their saved card or save a
 * new card and retry, all without leaving the livestream.
 */
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, CreditCard, Loader2, RotateCw, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { retryAuctionCharge } from "@/lib/auctionCharge.functions";
import { SavePaymentMethodModal } from "@/components/SavePaymentMethodModal";

type FailedOrder = {
  id: string;
  title: string;
  amount: number;
  stream_id: string | null;
};

export function FixPaymentModal({
  order, onClose, onResolved,
}: {
  order: FailedOrder | null;
  onClose: () => void;
  onResolved?: () => void;
}) {
  const retry = useServerFn(retryAuctionCharge);
  const [busy, setBusy] = useState(false);
  const [showSaveCard, setShowSaveCard] = useState(false);
  const [defaultCard, setDefaultCard] = useState<{ brand: string | null; last4: string | null } | null>(null);

  useEffect(() => {
    if (!order) return;
    (async () => {
      const { data } = await supabase
        .from("buyer_payment_methods" as any)
        .select("brand,last4")
        .eq("is_default", true)
        .maybeSingle();
      setDefaultCard(data as any);
    })();
  }, [order, showSaveCard]);

  if (!order) return null;

  async function handleRetry() {
    setBusy(true);
    try {
      const res = await retry({ data: { orderId: order!.id } });
      if (res.status === "paid") {
        toast.success("Payment successful · you're back in!");
        onResolved?.();
        onClose();
      } else if (res.status === "requires_action") {
        toast.error("Your bank requires extra verification. Please use a different card.");
        setShowSaveCard(true);
      } else {
        toast.error(res.message || "Payment failed again");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Could not retry payment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-2xl bg-card p-5 shadow-2xl ring-1 ring-rose-500/30">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-rose-400" />
              <h2 className="text-base font-bold">Payment failed</h2>
            </div>
            <button onClick={onClose} className="rounded-full p-1.5 hover:bg-muted" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-4 rounded-lg bg-rose-500/10 p-3 text-sm">
            <p className="font-bold truncate">{order.title}</p>
            <p className="text-rose-300 tabular-nums">${Number(order.amount).toFixed(2)}</p>
          </div>

          <p className="mb-4 text-xs text-muted-foreground">
            Your card on file was declined. Please retry or use a different card to
            unblock your bidding and keep your win.
          </p>

          {defaultCard?.last4 && (
            <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px]">
              <CreditCard className="h-3 w-3" />
              {defaultCard.brand?.toUpperCase() ?? "CARD"} •••• {defaultCard.last4}
            </p>
          )}

          <div className="flex flex-col gap-2">
            <button
              disabled={busy}
              onClick={handleRetry}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
              Retry with saved card
            </button>
            <button
              disabled={busy}
              onClick={() => setShowSaveCard(true)}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2.5 text-sm font-bold hover:bg-muted disabled:opacity-50"
            >
              <CreditCard className="h-4 w-4" />
              Use a different card
            </button>
            <Link
              to="/orders"
              className="text-center text-[11px] text-muted-foreground underline-offset-2 hover:underline"
            >
              Open my orders instead
            </Link>
          </div>
        </div>
      </div>

      <SavePaymentMethodModal
        open={showSaveCard}
        onClose={() => setShowSaveCard(false)}
        onSaved={() => {
          setShowSaveCard(false);
          // Auto-retry with the freshly saved card (becomes the default if first).
          handleRetry();
        }}
      />
    </>
  );
}
