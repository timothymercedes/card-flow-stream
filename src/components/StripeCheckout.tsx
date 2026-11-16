import { useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { useServerFn } from "@tanstack/react-start";
import { createMarketplaceCheckout } from "@/lib/stripe-connect.functions";
import { paymentEnvironment } from "@/lib/paymentConfirmation";
import { FinalSaleNotice } from "@/components/FinalSaleNotice";
import { Loader2, Tag } from "lucide-react";
import { applyStoreCoupon } from "@/lib/coupons.functions";

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
  const redeem = useServerFn(applyStoreCoupon);
  const [secret, setSecret] = useState<string>();
  const [error, setError] = useState<string>();
  const [version, setVersion] = useState(0);
  const [code, setCode] = useState("");
  const [couponMsg, setCouponMsg] = useState<{ ok: boolean; text: string }>();
  const [applying, setApplying] = useState(false);
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
  }, [props.sellerId, ids, create, version]);
  const apply = async () => {
    if (!code.trim()) return;
    setApplying(true); setCouponMsg(undefined);
    let r: { error?: string; discount?: number };
    try { r = await redeem({ data: { orderIds: ids.split(",").filter(Boolean), code: code.trim().toUpperCase() } }); }
    catch (e) { r = { error: e instanceof Error ? e.message : "Could not apply code" }; }
    setApplying(false);
    if (r.error) { setCouponMsg({ ok: false, text: r.error }); return; }
    setCouponMsg({ ok: true, text: `Code applied — you saved $${Number(r.discount).toFixed(2)}` }); setCode("");
    setVersion(v => v + 1); // new checkout with the lower, database-verified price
  };
  return <div className="space-y-4">
    {token?.startsWith("pk_test_") && <p className="border-b border-border pb-3 text-sm text-muted-foreground" role="status">Test mode — no real money charged; your orders remain unpaid.</p>}
    <div className="rounded-xl border border-border p-3">
      <label htmlFor="coupon" className="mb-1.5 flex items-center gap-1.5 text-xs font-bold"><Tag className="h-3.5 w-3.5" />Store coupon</label>
      <div className="flex gap-2">
        <input id="coupon" value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20))} placeholder="Enter code" className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm uppercase" />
        <button type="button" onClick={() => void apply()} disabled={applying || !code} className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">{applying ? "…" : "Apply"}</button>
      </div>
      {couponMsg && <p role="status" className={`mt-1.5 text-xs ${couponMsg.ok ? "text-primary" : "text-destructive"}`}>{couponMsg.text}</p>}
    </div>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : secret ?
      <EmbeddedCheckoutProvider key={secret} stripe={stripePromise} options={{ clientSecret: secret }}><EmbeddedCheckout /></EmbeddedCheckoutProvider> :
      <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading checkout" /></div>}
    <FinalSaleNotice variant="full" context="checkout" />
  </div>;
}
