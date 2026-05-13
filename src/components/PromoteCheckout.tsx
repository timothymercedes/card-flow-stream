import { useEffect, useMemo, useState } from "react";
import { loadStripe, Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { useServerFn } from "@tanstack/react-start";
import {
  createStreamPromotionPaymentIntent,
  getStripePublishableKey,
} from "@/server/stripe-connect.functions";
import { Flame, X } from "lucide-react";
import { toast } from "sonner";

interface Props {
  streamId: string;
  streamerName?: string;
  minAmount?: number; // dollars
  onClose: () => void;
}

let _stripePromise: Promise<Stripe | null> | null = null;
function getStripeJs(getKey: () => Promise<{ publishableKey: string }>) {
  if (!_stripePromise) {
    _stripePromise = getKey().then(({ publishableKey }) => loadStripe(publishableKey));
  }
  return _stripePromise;
}

const PRESETS = [100, 300, 500]; // $1, $3, $5

export function PromoteCheckout({ streamId, streamerName, minAmount = 1, onClose }: Props) {
  const getKey = useServerFn(getStripePublishableKey);
  const createIntent = useServerFn(createStreamPromotionPaymentIntent);
  const stripePromise = useMemo(() => getStripeJs(() => getKey()), []);

  const minCents = Math.max(100, Math.round(minAmount * 100));
  const [amountCents, setAmountCents] = useState<number>(Math.max(500, minCents));
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
      setError(e.message ?? "Failed to start promotion");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-card border border-border rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-orange-500" />
            <h2 className="text-lg font-bold">Promote {streamerName ?? "this live"}</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {!clientSecret ? (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Boost this live's ranking on Discover & the homepage. Promotions
              show in chat and a pinned banner.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {PRESETS.map((v) => {
                const disabled = v < minCents;
                return (
                  <button
                    key={v}
                    disabled={disabled}
                    onClick={() => {
                      setAmountCents(v);
                      setCustomAmount("");
                    }}
                    className={`rounded-xl border py-2 text-sm font-bold transition disabled:opacity-40 ${
                      amountCents === v && !customAmount
                        ? "border-orange-500 bg-orange-500/10 text-orange-500"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    ${v / 100}
                  </button>
                );
              })}
            </div>
            <div>
              <label className="text-xs text-muted-foreground">
                Custom amount (USD, min ${(minCents / 100).toFixed(0)})
              </label>
              <input
                type="number"
                min={minCents / 100}
                step="1"
                placeholder="0.00"
                value={customAmount}
                onChange={(e) => {
                  setCustomAmount(e.target.value);
                  const n = Math.round(parseFloat(e.target.value) * 100);
                  if (Number.isFinite(n) && n >= minCents) setAmountCents(n);
                }}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">
                Message (optional, shown on stream)
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 140))}
                rows={2}
                placeholder="Let's gooo 🔥"
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm resize-none"
              />
              <div className="text-[10px] text-muted-foreground text-right mt-0.5">
                {message.length}/140
              </div>
            </div>
            {error && (
              <div className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
                {error}
              </div>
            )}
            <button
              onClick={startPayment}
              disabled={loading || amountCents < minCents}
              className="w-full rounded-xl bg-gradient-to-r from-orange-500 to-rose-600 py-3 text-sm font-bold text-white disabled:opacity-60"
            >
              {loading
                ? "Loading…"
                : `Continue — Promote $${(amountCents / 100).toFixed(2)}`}
            </button>
          </div>
        ) : (
          <Elements
            stripe={stripePromise}
            options={{ clientSecret, appearance: { theme: "night" } }}
          >
            <PromoteForm
              fees={fees!}
              onSuccess={() => {
                toast.success("🔥 Stream promoted!");
                onClose();
              }}
            />
          </Elements>
        )}
      </div>
    </div>
  );
}

function PromoteForm({
  fees,
  onSuccess,
}: {
  fees: { buyerTotal: number; buyerServiceFee: number };
  onSuccess: () => void;
}) {
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
        <div className="flex justify-between text-muted-foreground">
          <span>Service fee</span>
          <span>${(fees.buyerServiceFee / 100).toFixed(2)}</span>
        </div>
        <div className="border-t border-border pt-1 mt-1 flex justify-between font-semibold text-sm">
          <span>Total</span>
          <span>${(fees.buyerTotal / 100).toFixed(2)}</span>
        </div>
      </div>
      <PaymentElement />
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="w-full rounded-xl bg-gradient-to-r from-orange-500 to-rose-600 py-3 text-sm font-bold text-white disabled:opacity-60"
      >
        {submitting ? "Processing…" : `🔥 Promote $${(fees.buyerTotal / 100).toFixed(2)}`}
      </button>
    </form>
  );
}
