import { useEffect, useMemo, useState } from "react";
import { loadStripe, Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { useServerFn } from "@tanstack/react-start";
import { createMarketplacePaymentIntent, getStripePublishableKey } from "@/server/stripe-connect.functions";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  sellerId: string;
  subtotalCents: number;
  orderId?: string;
  orderIds?: string[];
  onSuccess?: (paymentIntentId: string) => void;
  returnUrl?: string;
}

let _stripePromise: Promise<Stripe | null> | null = null;
function getStripeJs(getKey: () => Promise<{ publishableKey: string }>) {
  if (!_stripePromise) {
    _stripePromise = getKey().then(({ publishableKey }) => loadStripe(publishableKey));
  }
  return _stripePromise;
}

export function StripeCheckout(props: Props) {
  const getKey = useServerFn(getStripePublishableKey);
  const createIntent = useServerFn(createMarketplacePaymentIntent);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [fees, setFees] = useState<{ buyerTotal: number; platformFee: number; buyerServiceFee: number; intlFee?: number; isInternational?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stripePromise = useMemo(() => getStripeJs(() => getKey()), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await createIntent({
          data: { sellerId: props.sellerId, subtotalCents: props.subtotalCents, orderId: props.orderId, orderIds: props.orderIds },
        });
        if (cancelled) return;
        setClientSecret(res.clientSecret!);
        setFees({ buyerTotal: res.buyerTotal, platformFee: res.platformFee, buyerServiceFee: res.buyerServiceFee, intlFee: (res as any).intlFee, isInternational: (res as any).isInternational });
      } catch (e: any) {
        setError(e.message ?? "Failed to start payment");
      }
    })();
    return () => { cancelled = true; };
  }, [props.sellerId, props.subtotalCents, props.orderId]);

  if (error) return <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">{error}</div>;
  if (!clientSecret) return (
    <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  );

  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "night" } }}>
      <CheckoutForm {...props} fees={fees!} />
    </Elements>
  );
}

function CheckoutForm({ subtotalCents, fees, onSuccess, returnUrl }: Props & { fees: { buyerTotal: number; platformFee: number; buyerServiceFee: number } }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);

    const result = await stripe.confirmPayment({
      elements,
      confirmParams: returnUrl ? { return_url: returnUrl } : undefined,
      redirect: returnUrl ? "if_required" : "if_required",
    });

    if (result.error) {
      toast.error(result.error.message ?? "Payment failed");
      setSubmitting(false);
      return;
    }
    if (result.paymentIntent?.status === "succeeded") {
      toast.success("Payment successful");
      onSuccess?.(result.paymentIntent.id);
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1">
        <Row label="Subtotal" cents={subtotalCents} />
        <Row label="Platform Fee" cents={fees.platformFee} />
        <p className="text-[10px] text-muted-foreground leading-snug">
          Platform Fee — helps cover payment processing and marketplace operations.
        </p>
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
        {submitting ? "Processing…" : `Pay $${(fees.buyerTotal / 100).toFixed(2)}`}
      </button>
    </form>
  );
}

function Row({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span>
      <span>${(cents / 100).toFixed(2)}</span>
    </div>
  );
}
