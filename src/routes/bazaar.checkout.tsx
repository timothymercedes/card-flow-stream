import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { ArrowLeft, Loader2, Lock } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useBazaarCart } from "@/hooks/useBazaarCart";
import { loadCheckoutProducts } from "@/lib/bazaarProductLoader";
import { startBazaarCheckout } from "@/lib/bazaarCheckout.functions";
import { variantLabel } from "@/lib/bazaarShopping";
import { formatCents } from "@/lib/bazaar";
import { paymentEnvironment } from "@/lib/paymentConfirmation";
import type { CheckoutLine, ShippingAddress } from "@/lib/bazaarCheckout";

const token = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN;
const stripePromise = token ? loadStripe(token) : null;
const PENDING_CART_ORDER_KEY = "pbl-bazaar-pending-cart-order";

type Search = { product?: string; variant?: string; qty?: number; from?: "cart" };
const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);

export const Route = createFileRoute("/bazaar/checkout")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    product: uuid(s.product), variant: uuid(s.variant),
    qty: Number.isInteger(Number(s.qty)) && Number(s.qty) > 0 ? Math.min(50, Number(s.qty)) : undefined,
    from: s.from === "cart" ? "cart" : undefined,
  }),
  head: () => ({ meta: [{ title: "Checkout — PB Bazaar" }, { name: "description", content: "Secure fixed-price checkout for PB Bazaar products." }, { property: "og:title", content: "PB Bazaar Checkout" }, { property: "og:description", content: "Review your items, shipping address, tax and pay securely." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const search = Route.useSearch();
  const { user, loading } = useAuth();
  const cart = useBazaarCart();
  // Buy Now reads only the URL; it never reads or changes the saved cart.
  const buyNow = !!(search.product && search.variant);
  const source = buyNow ? "buy_now" : "cart";
  const lines: { productId: string; variantId: string; quantity: number }[] = buyNow
    ? [{ productId: search.product!, variantId: search.variant!, quantity: search.qty ?? 1 }]
    : search.from === "cart" ? cart.items.map((i) => ({ productId: i.productId, variantId: i.variantId, quantity: i.quantity })) : [];
  const ready = buyNow || cart.ready;
  return <AppShell><div className="mx-auto max-w-3xl space-y-6 px-3 py-5 sm:px-5">
    <Button asChild variant="ghost" size="sm"><Link to={buyNow ? "/bazaar/products/$id" : "/bazaar/cart"} params={{ id: search.product ?? "" }}><ArrowLeft />Back</Link></Button>
    <h1 className="flex items-center gap-2 text-2xl font-bold"><Lock className="h-5 w-5" />Checkout</h1>
    {token?.startsWith("pk_test_") && <p role="status" className="border-b border-border pb-3 text-sm text-muted-foreground">Test mode — use card 4242 4242 4242 4242. No real money is charged.</p>}
    {loading || !ready ? <p>Loading…</p>
      : !user ? <section className="space-y-3 border-t border-border pt-5"><p>Sign in to check out. Your cart stays saved.</p><Button asChild><Link to="/auth">Sign in</Link></Button></section>
      : !lines.length ? <section className="space-y-3 border-t border-border pt-5"><p className="text-muted-foreground">Nothing to check out.</p><Button asChild><Link to="/bazaar">Browse PB Bazaar</Link></Button></section>
      : <CheckoutForm source={source} lines={lines} email={user.email ?? ""} />}
  </div></AppShell>;
}

function CheckoutForm({ source, lines, email }: { source: "buy_now" | "cart"; lines: { productId: string; variantId: string; quantity: number }[]; email: string }) {
  const ids = [...new Set(lines.map((l) => l.productId))].sort();
  const products = useQuery({ queryKey: ["bazaar-checkout-products", ids], queryFn: () => loadCheckoutProducts(ids, true) });
  const start = useServerFn(startBazaarCheckout);
  const [address, setAddress] = useState<ShippingAddress>({ name: "", line1: "", line2: "", city: "", state: "", postalCode: "", country: "US", phone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [secret, setSecret] = useState<string>();
  const rows = useMemo(() => lines.map((l) => {
    const p = products.data?.find((x) => x.id === l.productId);
    return { ...l, product: p, variant: p?.bazaar_product_variants.find((v) => v.id === l.variantId) };
  }), [lines, products.data]);
  const subtotal = rows.reduce((n, r) => n + (r.variant ? r.variant.price_cents * r.quantity : 0), 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(undefined);
    try {
      const environment = paymentEnvironment(token);
      const items: CheckoutLine[] = lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity }));
      const result = await start({ data: { source, items, address: { ...address, line2: address.line2 || undefined, phone: address.phone || undefined }, environment } });
      if ("error" in result) throw new Error(result.error);
      if (source === "cart") sessionStorage.setItem(PENDING_CART_ORDER_KEY, JSON.stringify({ orderId: result.orderId, lines: items }));
      setSecret(result.clientSecret);
    } catch (err) { setError(err instanceof Error ? err.message : "Checkout couldn't start."); }
    finally { setBusy(false); }
  };

  if (secret) return <section aria-label="Payment" className="space-y-3"><p className="text-sm text-muted-foreground">Your items are held for about 30 minutes while you pay.</p><EmbeddedCheckoutProvider key={secret} stripe={stripePromise} options={{ clientSecret: secret }}><EmbeddedCheckout /></EmbeddedCheckoutProvider></section>;

  const field = (k: keyof ShippingAddress, label: string, props: React.ComponentProps<typeof Input> = {}) => <div className="space-y-1"><Label htmlFor={`addr-${k}`}>{label}</Label><Input id={`addr-${k}`} value={(address[k] as string) ?? ""} onChange={(e) => setAddress((a) => ({ ...a, [k]: e.target.value }))} {...props} /></div>;
  return <form onSubmit={submit} className="space-y-6">
    <section className="space-y-3 border-t border-border pt-4"><h2 className="font-semibold">{source === "buy_now" ? "Buy Now" : "Items from your cart"}</h2>
      {products.isLoading ? <p>Checking items…</p> : <ul className="divide-y divide-border">{rows.map((r) => <li key={r.variantId} className="flex justify-between gap-3 py-3"><div className="min-w-0"><p className="break-words font-medium">{r.product?.title ?? "Unavailable item"}</p><p className="text-xs text-muted-foreground">{r.variant ? variantLabel(r.variant.options) : "This option is unavailable"} · Qty {r.quantity}</p></div><p className="shrink-0 font-semibold">{r.variant ? formatCents(r.variant.price_cents * r.quantity) : "—"}</p></li>)}</ul>}
      <div className="flex justify-between"><span>Items subtotal</span><strong>{formatCents(subtotal)}</strong></div>
      <p className="text-sm text-muted-foreground">Shipping for some items is calculated for your address and shown, with sales tax, on the next step before you pay. Prices and stock are rechecked before payment.</p>
    </section>
    <section className="space-y-3 border-t border-border pt-4"><h2 className="font-semibold">Shipping address (US only)</h2>
      <p className="text-sm text-muted-foreground">Receipt goes to {email || "your account email"}.</p>
      {field("name", "Full name", { required: true, autoComplete: "name" })}
      {field("line1", "Street address", { required: true, autoComplete: "address-line1" })}
      {field("line2", "Apartment, suite (optional)", { autoComplete: "address-line2" })}
      <div className="grid gap-3 sm:grid-cols-3">{field("city", "City", { required: true, autoComplete: "address-level2" })}{field("state", "State (e.g. CA)", { required: true, maxLength: 2, autoComplete: "address-level1" })}{field("postalCode", "ZIP code", { required: true, inputMode: "numeric", autoComplete: "postal-code" })}</div>
      {field("phone", "Phone (optional)", { type: "tel", autoComplete: "tel" })}
    </section>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button type="submit" size="lg" className="w-full" disabled={busy || products.isLoading || rows.some((r) => !r.variant)}>{busy ? <><Loader2 className="animate-spin" />Checking stock, price and tax…</> : "Continue to payment"}</Button>
  </form>;
}
