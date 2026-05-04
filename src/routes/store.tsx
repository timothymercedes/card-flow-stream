import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { Package, Truck, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/store")({ component: MyStore });

function StatusIcon({ s }: { s: string }) {
  if (s === "delivered") return <CheckCircle2 className="h-4 w-4 text-primary" />;
  if (s === "shipped") return <Truck className="h-4 w-4 text-primary" />;
  return <Package className="h-4 w-4 text-muted-foreground" />;
}

function MyStore() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [tracking, setTracking] = useState<Record<string, string>>({});

  async function load() {
    if (!user) return;
    const { data } = await supabase.from("orders").select("*").eq("seller_id", user.id).order("created_at", { ascending: false });
    setOrders(data || []);
  }
  useEffect(() => { load(); }, [user]);

  async function ship(o: any) {
    const tn = tracking[o.id];
    if (!tn) return toast.error("Add tracking number");
    const { error } = await supabase.from("orders").update({ status: "shipped", tracking_number: tn, shipped_at: new Date().toISOString() }).eq("id", o.id);
    if (error) return toast.error(error.message);
    await supabase.from("notifications").insert({ user_id: o.buyer_id, type: "order", body: `Your "${o.title}" shipped — ${tn}`, link: "/orders" });
    toast.success("Marked shipped");
    load();
  }

  if (!user) return (
    <AppShell>
      <div className="px-6 py-16 text-center">
        <h1 className="text-xl font-bold">My Store</h1>
        <p className="mt-2 text-sm text-muted-foreground">Sign in to view items you've sold.</p>
        <Link to="/auth" className="mt-6 inline-block rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">Sign In</Link>
      </div>
    </AppShell>
  );

  return (
    <AppShell>
      <div className="px-4 py-4">
        <h1 className="mb-1 text-2xl font-bold">My Store</h1>
        <p className="mb-4 text-xs text-muted-foreground">Items you've sold via live or marketplace</p>
        {orders.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">No sales yet</p>}
        <div className="space-y-3">
          {orders.map((o) => (
            <div key={o.id} className="rounded-xl bg-card p-3">
              <div className="flex items-start gap-3">
                {o.item_image_url && <img src={o.item_image_url} alt={o.title} className="h-16 w-16 rounded-lg object-cover" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{o.title}</p>
                  {o.description && <p className="line-clamp-2 text-[11px] text-muted-foreground">{o.description}</p>}
                  <p className="text-xs font-semibold text-primary">${Number(o.amount).toFixed(2)}</p>
                </div>
                <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold capitalize">
                  <StatusIcon s={o.status} /> {o.status}
                </span>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">Ship to: {o.ship_name}, {o.ship_address}, {o.ship_city} {o.ship_state} {o.ship_zip}</p>
              {o.tracking_number && <p className="text-[11px] text-primary">Tracking: {o.tracking_number}</p>}
              {o.status === "pending" && (
                <div className="mt-2 flex gap-2">
                  <input value={tracking[o.id] || ""} onChange={(e) => setTracking({ ...tracking, [o.id]: e.target.value })} placeholder="Tracking #" className="flex-1 rounded-lg bg-input px-3 py-2 text-xs outline-none" />
                  <button onClick={() => ship(o)} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">Ship</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
