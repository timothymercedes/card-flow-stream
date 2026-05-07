import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { ShoppingBag, CreditCard, Package, X } from "lucide-react";
import { toast } from "sonner";
import { StripeCheckout } from "@/components/StripeCheckout";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";

export const Route = createFileRoute("/cart")({ component: Cart });

function Cart() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [checkoutSeller, setCheckoutSeller] = useState<string | null>(null);

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
    // Webhook will mark orders paid; do a best-effort optimistic update too.
    await supabase.from("orders").update({
      payment_status: "paid", paid_at: new Date().toISOString(),
    }).in("id", ids);
    toast.success(`Paid ${ids.length} item${ids.length === 1 ? "" : "s"}`);
    setCheckoutSeller(null);
    load();
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
        <h1 className="text-2xl font-bold">My Cart</h1>
        <p className="mt-2 text-sm text-muted-foreground">Sign in to view your cart.</p>
        <Link to="/auth" className="mt-6 inline-flex h-14 items-center justify-center rounded-2xl bg-primary px-8 text-base font-bold text-primary-foreground active:scale-[0.98]" data-tap>Sign In</Link>
      </div>
    </AppShell>
  );

  const checkoutItems = checkoutSeller ? groups[checkoutSeller] || [] : [];
  const checkoutSubtotal = checkoutItems.reduce((a, o) => a + Number(o.amount || 0), 0);
  const checkoutOrderIds = checkoutItems.map((o) => o.id);

  return (
    <AppShell>
      <div className="px-4 py-5">
        <h1 className="mb-1 flex items-center gap-2 text-3xl font-black"><ShoppingBag className="h-7 w-7" /> Cart</h1>
        <p className="mb-5 text-sm text-muted-foreground">Pay once per seller — combined shipping applied.</p>

        {Object.keys(groups).length === 0 && (
          <div className="rounded-2xl bg-card p-10 text-center">
            <Package className="mx-auto h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-sm text-muted-foreground">No items waiting to pay.</p>
            <Link to="/live" className="mt-5 inline-flex h-12 items-center justify-center rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground active:scale-[0.98]" data-tap>Browse live</Link>
          </div>
        )}

        <div className="space-y-4">
          {Object.entries(groups).map(([sellerId, items]) => {
            const total = items.reduce((a, o) => a + Number(o.amount || 0), 0);
            return (
              <div key={sellerId} className="rounded-2xl bg-card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-bold">{items.length} item{items.length === 1 ? "" : "s"}</p>
                  <p className="text-xl font-black text-primary">${total.toFixed(2)}</p>
                </div>
                <div className="space-y-2">
                  {items.map((o) => (
                    <div key={o.id} className="flex items-center gap-3 rounded-xl bg-muted/40 p-2.5">
                      {o.item_image_url && <img src={o.item_image_url} alt={o.title} className="h-14 w-14 shrink-0 rounded-lg object-cover" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{o.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {(o.quantity ?? 1) > 1 && <span>Qty {o.quantity} · </span>}
                          ${Number(o.amount).toFixed(2)}
                        </p>
                      </div>
                      <button onClick={() => removeItem(o.id)} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted active:scale-90 transition-transform" aria-label="Remove" data-tap>
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setCheckoutSeller(sellerId)}
                  className="mt-4 flex h-16 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-bold text-primary-foreground shadow-lg active:scale-[0.98] transition-transform md:h-12"
                  data-tap
                >
                  <CreditCard className="h-5 w-5" />
                  Pay ${total.toFixed(2)}
                </button>
              </div>
            );
          })}
        </div>

        <Drawer open={!!checkoutSeller} onOpenChange={(o) => !o && setCheckoutSeller(null)}>
          <DrawerContent className="px-4 pb-6">
            <DrawerHeader className="px-0">
              <DrawerTitle className="text-xl font-black">Checkout</DrawerTitle>
            </DrawerHeader>
            {checkoutSeller && (
              <StripeCheckout
                sellerId={checkoutSeller}
                subtotalCents={Math.round(checkoutSubtotal * 100)}
                orderIds={checkoutOrderIds}
                onSuccess={() => handlePaymentSuccess(checkoutSeller)}
              />
            )}
          </DrawerContent>
        </Drawer>
      </div>
    </AppShell>
  );
}
