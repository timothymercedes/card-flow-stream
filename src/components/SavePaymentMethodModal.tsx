/**
 * SavePaymentMethodModal — Stripe Elements UI that lets a buyer save a
 * card on file via SetupIntent. Used by `useRequireCardOnFile()` to hard-
 * gate bidding (and later, auto-charging winners off-session).
 */
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { toast } from "sonner";
import { X, CreditCard, ShieldCheck, Loader2 } from "lucide-react";
import { createSetupIntent, syncSetupIntentResult } from "@/lib/buyerPayments.functions";
import { getStripePublishableKey } from "@/lib/stripe-connect.functions";

let _stripePromise: Promise<Stripe | null> | null = null;
async function getStripeJs() {
  if (!_stripePromise) {
    _stripePromise = (async () => {
      try {
        const { publishableKey } = await getStripePublishableKey();
        return loadStripe(publishableKey);
      } catch (e) {
        console.error("getStripePublishableKey failed", e);
        return null;
      }
    })();
  }
  return _stripePromise;
}

function CardForm({ onSuccess, onClose }: { onSuccess: () => void; onClose: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const sync = useServerFn(syncSetupIntentResult);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    const { error, setupIntent } = await stripe.confirmSetup({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: "if_required",
    });
    if (error) {
      setSubmitting(false);
      toast.error(error.message ?? "Could not save card");
      return;
    }
    const pmId = typeof setupIntent?.payment_method === "string"
      ? setupIntent.payment_method
      : setupIntent?.payment_method?.id;
    if (!pmId) {
      setSubmitting(false);
      toast.error("Card not saved — please try again");
      return;
    }
    try {
      await sync({ data: { paymentMethodId: pmId } });
      toast.success("Card saved · you can bid now");
      onSuccess();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not save card");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-2.5 text-[11px] text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
        <p>
          Your card is stored securely with our payment processor — never on our servers.
          We auto-charge it the moment you win an auction so you never miss out.
        </p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-lg border border-white/10 px-3 py-2 text-sm font-bold hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!stripe || submitting}
          className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {submitting ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Save card"}
        </button>
      </div>
    </form>
  );
}

export function SavePaymentMethodModal({
  open, onClose, onSaved,
}: { open: boolean; onClose: () => void; onSaved?: () => void }) {
  const create = useServerFn(createSetupIntent);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [stripeJs, setStripeJs] = useState<Stripe | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setClientSecret(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [{ clientSecret: cs }, s] = await Promise.all([
          create(),
          getStripeJs(),
        ]);
        if (cancelled) return;
        if (!s) { setError("Payments are not configured yet."); return; }
        setStripeJs(s);
        setClientSecret(cs);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Could not start card setup");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, create]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-card p-5 shadow-2xl ring-1 ring-white/10">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            <h2 className="text-base font-bold">Add a card to bid</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-muted" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Save a card on file once — we'll auto-charge it instantly when you win an auction,
          so you can stay in the livestream without paying separately each time.
        </p>
        {loading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && (
          <p className="rounded-lg bg-rose-500/10 p-3 text-xs text-rose-300">{error}</p>
        )}
        {!loading && !error && clientSecret && stripeJs && (
          <Elements
            stripe={stripeJs}
            options={{
              clientSecret,
              appearance: { theme: "night", labels: "floating" },
            }}
          >
            <CardForm
              onSuccess={() => { onSaved?.(); onClose(); }}
              onClose={onClose}
            />
          </Elements>
        )}
      </div>
    </div>
  );
}
