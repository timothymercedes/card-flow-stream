import { useEffect, useMemo, useState } from "react";
import { loadStripe, Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { useServerFn } from "@tanstack/react-start";
import { createMarketplacePaymentIntent, getStripePublishableKey } from "@/lib/stripe-connect.functions";
import { recordPolicyAcceptance } from "@/lib/policy.functions";
import { FinalSaleNotice } from "@/components/FinalSaleNotice";
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
  const [fees, setFees] = useState<{ buyerTotal: number; platformFee: number; buyerServiceFee: number; intlFee?: number; processingFee?: number; buyerProcessingFee?: number; commissionCents?: number; isInternational?: boolean; taxCents?: number } | null>(null);
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
        setFees({ buyerTotal: res.buyerTotal, platformFee: res.platformFee, buyerServiceFee: res.buyerServiceFee, intlFee: (res as any).intlFee, processingFee: (res as any).processingFee, buyerProcessingFee: (res as any).buyerProcessingFee, commissionCents: (res as any).commissionCents, isInternational: (res as any).isInternational, taxCents: (res as any).taxCents });
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

function CheckoutForm({ subtotalCents, fees, onSuccess, returnUrl, orderId, orderIds }: Props & { fees: { buyerTotal: number; platformFee: number; buyerServiceFee: number; intlFee?: number; processingFee?: number; buyerProcessingFee?: number; commissionCents?: number; isInternational?: boolean; taxCents?: number } }) {
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
      try {
        const targets = orderIds && orderIds.length ? orderIds : orderId ? [orderId] : [undefined as string | undefined];
        for (const oid of targets) {
          recordPolicyAcceptance({
            data: { context: "checkout", orderId: oid, metadata: { payment_intent: result.paymentIntent.id } },
          }).catch(() => {});
        }
      } catch {}
      onSuccess?.(result.paymentIntent.id);
    }
    setSubmitting(false);
  }

  const intlFee = fees.intlFee ?? 0;
  const processingFee = fees.buyerProcessingFee ?? fees.processingFee ?? 0;
  const bundleDiscount = fees.platformFee === 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1">
        <Row label="Subtotal" cents={subtotalCents} />
        {bundleDiscount ? (
          <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-semibold">
            <span>🎁 Bundle discount</span>
            <span>Buyer-side fee waived</span>
          </div>
        ) : (
          <Row label="Platform Fee" cents={fees.platformFee} />
        )}
        {intlFee > 0 && (
          <>
            <Row label="International Processing Fee (4%)" cents={intlFee} />
            <p className="text-[10px] text-amber-600 dark:text-amber-400 leading-snug">
              Applied because this is a cross-border transaction (buyer or seller outside the USA). Helps cover international card processing & FX. Customs duties/VAT may also apply on delivery and are not included.
            </p>
          </>
        )}
        {processingFee > 0 && (
          <Row label="Processing fee" cents={processingFee} />
        )}
        {(fees.taxCents ?? 0) > 0 && (
          <Row label="Sales tax" cents={fees.taxCents ?? 0} />
        )}
        <p className="text-[10px] text-muted-foreground leading-snug">
          {bundleDiscount
            ? "You've already won 3+ items in this live stream — buyer-side processing is waived on additional items."
            : "Platform fee helps cover marketplace operations. Card processing fee (2.9% + $0.30) is passed through from our payment processor so 100% of the item price goes to the seller (minus our 5% marketplace commission)."}
        </p>
        <div className="border-t border-border pt-1 mt-1 flex justify-between font-semibold text-sm">
          <span>Total</span>
          <span>${(fees.buyerTotal / 100).toFixed(2)}</span>
        </div>
      </div>
      <PaymentElement />
      <FinalSaleNotice variant="full" context="checkout" />
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
