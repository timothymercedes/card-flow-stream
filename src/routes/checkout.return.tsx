import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getCheckoutConfirmation } from "@/lib/checkoutConfirmation.functions";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { paymentEnvironment } from "@/lib/paymentConfirmation";

export const Route = createFileRoute("/checkout/return")({
  validateSearch: (search: Record<string, unknown>) => ({ session_id: typeof search.session_id === "string" ? search.session_id : undefined, test: search.test === true || search.test === "true" }),
  head: () => ({ meta: [
    { title: "Payment confirmation — PullBid Live" },
    { name: "description", content: "Check the verified status of your PullBid Live payment." },
    { property: "og:title", content: "Payment confirmation — PullBid Live" },
    { property: "og:description", content: "Your secure PullBid Live payment confirmation." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Confirmation,
});

function Confirmation() {
  const { session_id, test } = Route.useSearch();
  const { user, loading } = useAuth();
  const confirm = useServerFn(getCheckoutConfirmation);
  const [message, setMessage] = useState("Checking payment…");
  useEffect(() => {
    if (!user || !session_id) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await confirm({ data: { sessionId: session_id, environment: test ? "sandbox" : paymentEnvironment(import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN) } });
        if (!cancelled) setMessage("error" in result ? result.error : result.status === "paid" ? (result.test ? "Test payment confirmed — no real money charged" : "Payment confirmed") : "Payment pending — check your orders shortly");
      } catch (error) { if (!cancelled) setMessage(error instanceof Error ? error.message : "Unable to check payment"); }
    })();
    return () => { cancelled = true; };
  }, [user, session_id, test, confirm]);
  return <main className="mx-auto max-w-lg px-6 py-16 space-y-6">
    <h1 className="text-2xl font-bold">Payment confirmation</h1>
    <p role="status" className="text-muted-foreground">{!session_id ? "No payment information found." : loading ? "Checking your account…" : !user ? "Sign in to verify your payment." : message}</p>
    <Button asChild><Link to={user ? "/orders" : "/auth"}> {user ? "View orders" : "Sign in"}</Link></Button>
  </main>;
}