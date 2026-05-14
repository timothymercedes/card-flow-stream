import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { ShoppingBag, CreditCard, Package, X } from "lucide-react";
import { toast } from "sonner";
import { StripeCheckout } from "@/components/StripeCheckout";
import { WatchTutorial } from "@/components/WatchTutorial";
import { IntlWarningBanner } from "@/components/InternationalShippingWarning";
import { ShippingEstimator } from "@/components/ShippingEstimator";

export const Route = createFileRoute("/cart")({ component: Cart });

function Cart() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [checkoutSeller, setCheckoutSeller] = useState<string | null>(null);
  const [buyerCountry, setBuyerCountry] = useState<string>("US");
  const [sellerCountries, setSellerCountries] = useState<Record<string, string>>({});

  async function load() {
    if (!user) return;
    const { data } = await supabase.from("orders")
      .select("*")
      .eq("buyer_id", user.id)
      .eq("payment_status", "awaiting_payment")
      .order("created_at", { ascending: false });
    setOrders(data || []);
  }
  useEffect(() => { load(); }, [user]);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("address_country").eq("id", user.id).maybeSingle()
      .then(({ data }) => { if (data?.address_country) setBuyerCountry(String(data.address_country).toUpperCase()); });
  }, [user]);

  useEffect(() => {
    const ids = Array.from(new Set(orders.map((o) => o.seller_id))).filter((id) => !(id in sellerCountries));
    if (!ids.length) return;
    Promise.all(ids.map((id) =>
      (supabase.rpc as any)("seller_country", { _seller_id: id }).then((r: any) => [id, String(r.data || "US").toUpperCase()] as const)
    )).then((entries) => {
      setSellerCountries((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    }).catch(() => {});
  }, [orders]);

  const groups = useMemo(() => {
    const m: Record<string, any[]> = {};
    for (const o of orders) {
      const k = o.seller_id;
      (m[k] = m[k] || []).push(o);
    }
    return m;
  }, [orders]);

  async function handlePaymentSuccess(sellerId: string) {
    const ids = (groups[sellerId] || []).map((o) => o.id);
    toast.success(`Paid ${ids.length} item${ids.length === 1 ? "" : "s"} — confirming…`);
    setCheckoutSeller(null);
    // Webhook marks orders paid. Poll briefly for confirmation.
    setTimeout(load, 1500);
    setTimeout(load, 4000);
  }

  async function removeItem(orderId: string) {
    const { error } = await supabase.from("orders").delete().eq("id", orderId).eq("payment_status", "awaiting_payment");
    if (error) return toast.error(error.message);
    toast.success("Removed");
    load();
  }

  if (!user) return (
    <AppShell>
      <div className="px-6 py-16 text-center">
        <h1 className="text-xl font-bold">My Cart</h1>
        <p className="mt-2 text-sm text-muted-foreground">Sign in to view your cart.</p>
        <Link to="/auth" className="mt-6 inline-block rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">Sign In</Link>
      </div>
    </AppShell>
  );

  const checkoutItems = checkoutSeller ? groups[checkoutSeller] || [] : [];
  const checkoutSubtotal = checkoutItems.reduce((a, o) => a + Number(o.amount || 0), 0);
  const checkoutOrderIds = checkoutItems.map((o) => o.id);

  return (
    <AppShell>
      <div className="px-4 py-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h1 className="flex items-center gap-2 text-2xl font-bold"><ShoppingBag className="h-6 w-6" /> My Cart</h1>
          <WatchTutorial routePath="/cart" label="Checkout help" />
        </div>
        <p className="mb-4 text-xs text-muted-foreground">Pay once per seller — combined shipping is already applied.</p>

        {Object.keys(groups).length === 0 && (
          <div className="rounded-xl bg-card p-8 text-center">
            <Package className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">No items waiting to pay.</p>
            <Link to="/live" className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground">Browse live</Link>
          </div>
        )}

        <div className="space-y-4">
          {Object.entries(groups).map(([sellerId, items]) => {
            const total = items.reduce((a, o) => a + Number(o.amount || 0), 0);
            const sellerCountry = sellerCountries[sellerId] || "US";
            const isIntl = sellerCountry !== buyerCountry;
            return (
              <div key={sellerId} className="rounded-xl bg-card p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-bold">{items.length} item{items.length === 1 ? "" : "s"} from this seller</p>
                  <p className="text-base font-extrabold text-primary">${total.toFixed(2)}</p>
                </div>
                {isIntl && (
                  <div className="mb-2">
                    <IntlWarningBanner buyerCountry={buyerCountry} sellerCountry={sellerCountry} variant="full" />
                    <p className="mt-1 text-[11px] text-amber-300/90">A 4% International Processing Fee will be itemized at checkout.</p>
                  </div>
                )}
                <div className="space-y-2">
                  {items.map((o) => (
                    <div key={o.id} className="flex items-center gap-2 rounded-lg bg-muted/40 p-2">
                      {o.item_image_url && <img src={o.item_image_url} alt={o.title} className="h-12 w-12 shrink-0 rounded object-cover" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold">{o.title}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {(o.quantity ?? 1) > 1 && <span>Qty {o.quantity} · </span>}
                          ${Number(o.amount).toFixed(2)}
                        </p>
                      </div>
                      <button onClick={() => removeItem(o.id)} className="rounded-full p-1.5 hover:bg-muted" aria-label="Remove">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setCheckoutSeller(sellerId)}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground"
                >
                  <CreditCard className="h-4 w-4" />
                  {`Checkout $${total.toFixed(2)}`}
                </button>
              </div>
            );
          })}
        </div>

        {checkoutSeller && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={() => setCheckoutSeller(null)}>
            <div className="relative w-full max-w-md rounded-t-2xl bg-card p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setCheckoutSeller(null)} className="absolute right-3 top-3 rounded-full bg-muted p-1.5"><X className="h-4 w-4" /></button>
              <h2 className="mb-3 text-lg font-bold">Checkout</h2>
              {(sellerCountries[checkoutSeller] || "US") !== buyerCountry && (
                <div className="mb-3">
                  <IntlWarningBanner buyerCountry={buyerCountry} sellerCountry={sellerCountries[checkoutSeller] || "US"} variant="full" />
                </div>
              )}
              <StripeCheckout
                sellerId={checkoutSeller}
                subtotalCents={Math.round(checkoutSubtotal * 100)}
                orderIds={checkoutOrderIds}
                onSuccess={() => handlePaymentSuccess(checkoutSeller)}
              />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
