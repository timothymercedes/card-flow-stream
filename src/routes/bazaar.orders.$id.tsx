import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useBazaarCart } from "@/hooks/useBazaarCart";
import { supabase } from "@/integrations/supabase/client";
import { formatCents } from "@/lib/bazaar";
import { ORDER_STATUS_LABEL, removeOrderedFromCart, type CheckoutLine } from "@/lib/bazaarCheckout";

const PENDING_CART_ORDER_KEY = "pbl-bazaar-pending-cart-order";
const PAID = new Set(["awaiting_fulfillment_approval", "paid_inventory_exception", "fulfillment_authorized", "shipped", "delivered"]);

export const Route = createFileRoute("/bazaar/orders/$id")({
  head: () => ({ meta: [{ title: "Order Details — PB Bazaar" }, { name: "description", content: "Status and details of your PB Bazaar order." }, { property: "og:title", content: "PB Bazaar Order" }, { property: "og:description", content: "Your PB Bazaar order status." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: OrderPage,
});

function OrderPage() {
  const { id } = Route.useParams();
  const { user, loading } = useAuth();
  const cart = useBazaarCart();
  // Status comes only from the server (set by the verified payment webhook), never from the URL.
  const order = useQuery({ queryKey: ["bazaar-order", id, user?.id], enabled: !!user && /^[0-9a-f-]{36}$/i.test(id), queryFn: async () => {
    const { data, error } = await supabase.from("bazaar_orders").select("*, bazaar_order_items(id, title, variant_label, sku, quantity, unit_price_cents, line_total_cents, image_url)").eq("id", id).maybeSingle();
    if (error) throw error; return data;
  }, refetchInterval: (q) => (q.state.data?.status === "pending_payment" ? 3000 : false) });
  const status = order.data?.status;
  useEffect(() => {
    if (!status || !PAID.has(status) || !cart.ready) return;
    try {
      const pending = JSON.parse(sessionStorage.getItem(PENDING_CART_ORDER_KEY) ?? "null") as { orderId: string; lines: CheckoutLine[] } | null;
      if (pending?.orderId !== id) return;
      cart.update((items) => removeOrderedFromCart(items, pending.lines));
      sessionStorage.removeItem(PENDING_CART_ORDER_KEY);
    } catch { /* cart stays as is */ }
  }, [status, id, cart.ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const o = order.data;
  return <AppShell><div className="mx-auto max-w-3xl space-y-5 px-3 py-5 sm:px-5">
    <Button asChild variant="ghost" size="sm"><Link to="/bazaar/orders"><ArrowLeft />My retail orders</Link></Button>
    {loading ? <p>Loading…</p> : !user ? <div className="space-y-3"><p>Sign in to see this order.</p><Button asChild><Link to="/auth">Sign in</Link></Button></div>
      : order.isLoading ? <p>Loading order…</p> : !o ? <p role="alert">Order not found.</p>
      : <>
        <div><h1 className="text-2xl font-bold">Order {o.order_number}</h1><p className="mt-1 font-medium">{ORDER_STATUS_LABEL[o.status] ?? o.status}</p>
          {o.status === "pending_payment" && <p className="text-sm text-muted-foreground">Waiting for payment confirmation from Stripe… This page updates automatically.</p>}
          {o.status === "awaiting_fulfillment_approval" && <p className="text-sm text-muted-foreground">Payment received. Our team will approve and prepare your order.</p>}
          {o.status === "paid_inventory_exception" && <p className="text-sm text-muted-foreground">Payment received, but stock changed during checkout. Our team will contact you.</p>}
          {o.environment === "sandbox" && <p className="mt-2 text-xs text-muted-foreground">Test-mode order — no real money was charged.</p>}
        </div>
        <ul className="divide-y divide-border border-t border-border">{o.bazaar_order_items.map((i) => <li key={i.id} className="flex justify-between gap-3 py-3"><div className="min-w-0"><p className="break-words font-medium">{i.title}</p><p className="text-xs text-muted-foreground">{i.variant_label} · {i.sku} · Qty {i.quantity} × {formatCents(i.unit_price_cents)}</p></div><strong className="shrink-0">{formatCents(i.line_total_cents)}</strong></li>)}</ul>
        <dl className="space-y-1 border-t border-border pt-3 text-sm">
          <div className="flex justify-between"><dt>Items</dt><dd>{formatCents(o.subtotal_cents)}</dd></div>
          <div className="flex justify-between"><dt>Shipping</dt><dd>{o.shipping_cents ? formatCents(o.shipping_cents) : "Included"}</dd></div>
          <div className="flex justify-between"><dt>Sales tax ({o.tax_jurisdiction})</dt><dd>{formatCents(o.tax_cents)}</dd></div>
          <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd>{formatCents(o.total_cents)}</dd></div>
        </dl>
        <div className="border-t border-border pt-3 text-sm"><p className="font-semibold">Ship to</p><p>{o.shipping_name}</p><p>{o.shipping_line1}{o.shipping_line2 ? `, ${o.shipping_line2}` : ""}</p><p>{o.shipping_city}, {o.shipping_region} {o.shipping_postal_code}</p></div>
      </>}
  </div></AppShell>;
}
