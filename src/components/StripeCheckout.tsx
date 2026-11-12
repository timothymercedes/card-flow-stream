import { useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { useServerFn } from "@tanstack/react-start";
import { createMarketplaceCheckout } from "@/lib/stripe-connect.functions";
import { paymentEnvironment } from "@/lib/paymentConfirmation";
import { FinalSaleNotice } from "@/components/FinalSaleNotice";
import { Loader2 } from "lucide-react";

interface Props {
  sellerId: string;
  subtotalCents: number;
  orderId?: string;
  orderIds?: string[];
  onSuccess?: (paymentIntentId: string) => void;
  returnUrl?: string;
}
const token = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN;
const stripePromise = token ? loadStripe(token) : null;

export function StripeCheckout(props: Props) {
  const create = useServerFn(createMarketplaceCheckout);
  const [secret, setSecret] = useState<string>();
  const [error, setError] = useState<string>();
  const ids = (props.orderIds ?? (props.orderId ? [props.orderId] : [])).join(",");
  useEffect(() => {
    let cancelled = false;
    setSecret(undefined); setError(undefined);
    void (async () => {
      try {
        const environment = paymentEnvironment(token);
        const result = await create({ data: {
          sellerId: props.sellerId, orderIds: ids.split(",").filter(Boolean),
          environment,
          returnUrl: `${window.location.origin}/checkout/return?test=${environment === "sandbox"}&session_id={CHECKOUT_SESSION_ID}`,
        } });
        if ("error" in result) throw new Error(result.error);
        if (!result.clientSecret) throw new Error("Stripe did not return a checkout.");
        if (!cancelled) setSecret(result.clientSecret);
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "Unable to start checkout"); }
    })();
    return () => { cancelled = true; };
  }, [props.sellerId, ids, create]);
  return <div className="space-y-4">
    {token?.startsWith("pk_test_") && <p className="border-b border-border pb-3 text-sm text-muted-foreground" role="status">Test mode — no real money charged; your orders remain unpaid.</p>}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : secret ?
      <EmbeddedCheckoutProvider key={secret} stripe={stripePromise} options={{ clientSecret: secret }}><EmbeddedCheckout /></EmbeddedCheckoutProvider> :
      <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading checkout" /></div>}
    <FinalSaleNotice variant="full" context="checkout" />
  </div>;
}
