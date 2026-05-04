import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { ShoppingBag, CreditCard, Package } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/cart")({ component: Cart });

function Cart() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [paying, setPaying] = useState<string | null>(null);

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

  // Group by seller
  const groups = useMemo(() => {
    const m: Record<string, any[]> = {};
    for (const o of orders) {
      const k = o.seller_id;
      (m[k] = m[k] || []).push(o);
    }
    return m;
  }, [orders]);

  // Pay all from one seller in one click; combined-shipping cap is already
  // applied at order creation time, so we just mark them paid together.
  async function paySeller(sellerId: string) {
    setPaying(sellerId);
    const ids = (groups[sellerId] || []).map((o) => o.id);
    const { error } = await supabase.from("orders").update({
      payment_status: "paid", paid_at: new Date().toISOString(),
    }).in("id", ids);
    setPaying(null);
    if (error) return toast.error(error.message);
    toast.success(`Paid ${ids.length} item${ids.length === 1 ? "" : "s"} (safe mode)`);
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

  return (
    <AppShell>
      <div className="px-4 py-4">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold"><ShoppingBag className="h-6 w-6" /> My Cart</h1>
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
            return (
              <div key={sellerId} className="rounded-xl bg-card p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-bold">{items.length} item{items.length === 1 ? "" : "s"} from this seller</p>
                  <p className="text-base font-extrabold text-primary">${total.toFixed(2)}</p>
                </div>
                <div className="space-y-2">
                  {items.map((o) => (
                    <div key={o.id} className="flex items-center gap-2 rounded-lg bg-muted/40 p-2">
                      {o.item_image_url && <img src={o.item_image_url} alt={o.title} className="h-12 w-12 shrink-0 rounded object-cover" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold">{o.title}</p>
                        <p className="text-[11px] text-muted-foreground">${Number(o.amount).toFixed(2)}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => paySeller(sellerId)}
                  disabled={paying === sellerId}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
                >
                  <CreditCard className="h-4 w-4" />
                  {paying === sellerId ? "Processing…" : `Pay $${total.toFixed(2)} (1 checkout)`}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
