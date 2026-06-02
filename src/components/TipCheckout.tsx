import { useEffect, useMemo, useState } from "react";
import { loadStripe, Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { useServerFn } from "@tanstack/react-start";
import { createStreamTipPaymentIntent, getStripePublishableKey } from "@/lib/stripe-connect.functions";
import { Loader2, X, Gift } from "lucide-react";
import { toast } from "sonner";

interface Props {
  streamId: string;
  streamerName?: string;
  onClose: () => void;
}

let _stripePromise: Promise<Stripe | null> | null = null;
function getStripeJs(getKey: () => Promise<{ publishableKey: string }>) {
  if (!_stripePromise) {
    _stripePromise = getKey().then(({ publishableKey }) => loadStripe(publishableKey));
  }
  return _stripePromise;
}

const PRESETS = [200, 500, 1000, 2000];

export function TipCheckout({ streamId, streamerName, onClose }: Props) {
  const getKey = useServerFn(getStripePublishableKey);
  const createIntent = useServerFn(createStreamTipPaymentIntent);
  const stripePromise = useMemo(() => getStripeJs(() => getKey()), []);

  const [amountCents, setAmountCents] = useState<number>(500);
  const [customAmount, setCustomAmount] = useState("");
  const [message, setMessage] = useState("");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [fees, setFees] = useState<{ buyerTotal: number; buyerServiceFee: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startPayment() {
    setLoading(true);
    setError(null);
    try {
      const res = await createIntent({
        data: { streamId, amountCents, message: message.trim() || undefined },
      });
      setClientSecret(res.clientSecret!);
      setFees({ buyerTotal: res.buyerTotal, buyerServiceFee: res.buyerServiceFee });
    } catch (e: any) {
      setError(e.message ?? "Failed to start tip");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full sm:max-w-md bg-card border border-border rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">Tip {streamerName ?? "streamer"}</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {!clientSecret ? (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-2">
              {PRESETS.map((v) => (
                <button
                  key={v}
                  onClick={() => { setAmountCents(v); setCustomAmount(""); }}
                  className={`rounded-xl border py-2 text-sm font-bold transition ${
                    amountCents === v && !customAmount ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"
                  }`}
                >
                  ${v / 100}
                </button>
              ))}
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Custom amount (USD, min $2)</label>
              <input
                type="number"
                min={2}
                step="1"
                placeholder="0.00"
                value={customAmount}
                onChange={(e) => {
                  setCustomAmount(e.target.value);
                  const n = Math.round(parseFloat(e.target.value) * 100);
                  if (Number.isFinite(n) && n >= 200) setAmountCents(n);
                }}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Message (optional, shown on stream)</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 200))}
                rows={2}
                placeholder="Love the stream!"
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm resize-none"
              />
              <div className="text-[10px] text-muted-foreground text-right mt-0.5">{message.length}/200</div>
            </div>
            {error && <div className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">{error}</div>}
            <button
              onClick={startPayment}
              disabled={loading || amountCents < 200}
              className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              {loading ? "Loading…" : `Continue — $${(amountCents / 100).toFixed(2)}`}
            </button>
          </div>
        ) : (
          <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "night" } }}>
            <TipForm
              amountCents={amountCents}
              fees={fees!}
              onSuccess={() => {
                toast.success("Tip sent! 🎉");
                onClose();
              }}
            />
          </Elements>
        )}
      </div>
    </div>
  );
}

function TipForm({ amountCents, fees, onSuccess }: { amountCents: number; fees: { buyerTotal: number; buyerServiceFee: number }; onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    const result = await stripe.confirmPayment({ elements, redirect: "if_required" });
    if (result.error) {
      toast.error(result.error.message ?? "Payment failed");
      setSubmitting(false);
      return;
    }
    if (result.paymentIntent?.status === "succeeded") {
      onSuccess();
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1">
        <div className="flex justify-between text-muted-foreground"><span>Tip</span><span>${(amountCents / 100).toFixed(2)}</span></div>
        <div className="flex justify-between text-muted-foreground"><span>Service fee</span><span>${(fees.buyerServiceFee / 100).toFixed(2)}</span></div>
        <div className="border-t border-border pt-1 mt-1 flex justify-between font-semibold text-sm">
          <span>Total</span>
          <span>${(fees.buyerTotal / 100).toFixed(2)}</span>
        </div>
      </div>
      <PaymentElement />
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-60"
      >
        {submitting ? "Processing…" : `Send tip $${(fees.buyerTotal / 100).toFixed(2)}`}
      </button>
    </form>
  );
}
