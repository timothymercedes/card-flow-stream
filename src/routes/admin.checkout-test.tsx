import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { createSafeCheckoutTest } from "@/lib/checkoutConfirmation.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/checkout-test")({
  head: () => ({ meta: [
    { title: "Checkout test — PullBid Live Admin" }, { name: "description", content: "Safely verify PullBid checkout in Stripe sandbox." },
    { property: "og:title", content: "Checkout test — PullBid Live Admin" }, { property: "og:description", content: "Admin-only sandbox payment verification." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: CheckoutTest,
});
function CheckoutTest() {
  const create = useServerFn(createSafeCheckoutTest);
  const [secret, setSecret] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [stripe] = useState(() => import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN?.startsWith("pk_test_") ? loadStripe(import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN) : null);
  return <main className="mx-auto max-w-3xl px-6 py-10 space-y-6">
    <h1 className="text-2xl font-bold">Checkout test</h1>
    <p className="border-b border-border pb-4 text-muted-foreground">Test mode only. No real money is charged and no orders are changed.</p>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {!secret ? <Button disabled={busy || !stripe} onClick={async () => {
      setBusy(true); setError(undefined);
      try {
        const result = await create({ data: { returnUrl: `${window.location.origin}/checkout/return?test=true&session_id={CHECKOUT_SESSION_ID}` } });
        if ("error" in result) throw new Error(result.error);
        if (!result.clientSecret) throw new Error("Stripe did not return a checkout.");
        setSecret(result.clientSecret);
      } catch (e) { setError(e instanceof Error ? e.message : "Checkout unavailable"); }
      finally { setBusy(false); }
    }}>Start $1 test checkout</Button> : <EmbeddedCheckoutProvider stripe={stripe} options={{ clientSecret: secret }}><EmbeddedCheckout /></EmbeddedCheckoutProvider>}
  </main>;
}